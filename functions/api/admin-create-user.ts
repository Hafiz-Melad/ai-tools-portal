import {
  createClient,
  type SupabaseClient,
} from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type CreateCustomerRequest = {
  email?: unknown
  password?: unknown
  credits?: unknown
}

type PlanRow = {
  id: string
  name: string | null
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-tools-portal-9h5.pages.dev',
]

function requireEnv(
  value: string | undefined,
  variableName: string
): string {
  const cleanedValue = value?.trim()

  if (!cleanedValue) {
    throw new Error(
      `${variableName} is missing from the Cloudflare environment.`
    )
  }

  return cleanedValue
}

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin')

  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : 'https://ai-tools-portal-9h5.pages.dev'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200
): Response {
  return Response.json(body, {
    status,
    headers: getCorsHeaders(request),
  })
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

async function resolveDefaultPlan(
  supabaseAdmin: SupabaseClient<any>
): Promise<PlanRow> {
  const {
    data: megaPlans,
    error: megaPlanError,
  } = await supabaseAdmin
    .from('plans')
    .select('id, name')
    .ilike('name', '%mega%')
    .limit(2)

  if (megaPlanError) {
    throw new Error(
      `Could not load the default plan: ${megaPlanError.message}`
    )
  }

  if (megaPlans && megaPlans.length === 1) {
    return megaPlans[0] as PlanRow
  }

  const {
    data: availablePlans,
    error: availablePlansError,
  } = await supabaseAdmin
    .from('plans')
    .select('id, name')
    .limit(2)

  if (availablePlansError) {
    throw new Error(
      `Could not load available plans: ${availablePlansError.message}`
    )
  }

  if (!availablePlans || availablePlans.length === 0) {
    throw new Error(
      'No plan exists in Supabase. Create the Mega plan before creating customers.'
    )
  }

  if (availablePlans.length > 1) {
    throw new Error(
      'The default customer plan is ambiguous. Keep one plan or name the intended plan Mega.'
    )
  }

  return availablePlans[0] as PlanRow
}

export async function onRequestOptions(
  context: FunctionContext
): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  })
}

export async function onRequestPost(
  context: FunctionContext
): Promise<Response> {
  try {
    const contentType =
      context.request.headers.get('Content-Type') ?? ''

    if (
      !contentType
        .toLowerCase()
        .includes('application/json')
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The request body must use application/json.',
        },
        415
      )
    }

    const authorizationHeader =
      context.request.headers.get('Authorization')

    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith('Bearer ')
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Authentication is required.',
        },
        401
      )
    }

    const accessToken = authorizationHeader
      .slice('Bearer '.length)
      .trim()

    if (!accessToken) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Invalid authentication token.',
        },
        401
      )
    }

    let body: CreateCustomerRequest

    try {
      body =
        (await context.request.json()) as CreateCustomerRequest
    } catch {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The JSON request body is invalid.',
        },
        400
      )
    }

    const email =
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : ''

    const password =
      typeof body.password === 'string'
        ? body.password
        : ''

    const credits = body.credits

    if (!email || !isValidEmail(email)) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Enter a valid customer email address.',
        },
        400
      )
    }

    if (password.length < 8) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The customer password must contain at least 8 characters.',
        },
        400
      )
    }

    if (
      typeof credits !== 'number' ||
      !Number.isInteger(credits) ||
      credits < 0
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Initial credits must be a non-negative whole number.',
        },
        400
      )
    }

    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    const {
      data: { user: authenticatedUser },
      error: authenticatedUserError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (authenticatedUserError || !authenticatedUser) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Your login session is invalid or has expired.',
        },
        401
      )
    }

    const {
      data: adminProfile,
      error: adminProfileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', authenticatedUser.id)
      .maybeSingle()

    if (adminProfileError) {
      throw new Error(
        `Could not verify administrator access: ${adminProfileError.message}`
      )
    }

    if (!adminProfile || adminProfile.role !== 'admin') {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Administrator access is required.',
        },
        403
      )
    }

    const defaultPlan = await resolveDefaultPlan(
      supabaseAdmin
    )

    const {
      data: createdAuthData,
      error: createAuthError,
    } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        created_by_admin: authenticatedUser.id,
      },
    })

    if (createAuthError) {
      const normalizedMessage =
        createAuthError.message.toLowerCase()

      const status =
        normalizedMessage.includes('already') ||
        normalizedMessage.includes('registered') ||
        normalizedMessage.includes('exists')
          ? 409
          : 400

      return jsonResponse(
        context.request,
        {
          success: false,
          error: createAuthError.message,
        },
        status
      )
    }

    const createdUser = createdAuthData.user

    if (!createdUser) {
      throw new Error(
        'Supabase did not return the newly created user.'
      )
    }

    let setupCompleted = false

    try {
      const accountStatus =
        credits > 0 ? 'active' : 'inactive'

      const {
        error: profileUpsertError,
      } = await supabaseAdmin
        .from('profiles')
        .upsert(
          {
            id: createdUser.id,
            role: 'customer',
            credits,
            subscription_status: accountStatus,
            credits_exhausted_at:
              credits === 0
                ? new Date().toISOString()
                : null,
          },
          {
            onConflict: 'id',
          }
        )

      if (profileUpsertError) {
        throw new Error(
          `Could not create the customer profile: ${profileUpsertError.message}`
        )
      }

      const {
        error: removeExistingSubscriptionError,
      } = await supabaseAdmin
        .from('subscriptions')
        .delete()
        .eq('user_id', createdUser.id)

      if (removeExistingSubscriptionError) {
        throw new Error(
          `Could not prepare the customer subscription: ${removeExistingSubscriptionError.message}`
        )
      }

      const {
        error: subscriptionInsertError,
      } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: createdUser.id,
          plan_id: defaultPlan.id,
          status: accountStatus,
        })

      if (subscriptionInsertError) {
        throw new Error(
          `Could not create the customer subscription: ${subscriptionInsertError.message}`
        )
      }

      setupCompleted = true
    } finally {
      if (!setupCompleted) {
        const { error: cleanupError } =
          await supabaseAdmin.auth.admin.deleteUser(
            createdUser.id
          )

        if (cleanupError) {
          console.error(
            'CREATE CUSTOMER CLEANUP ERROR:',
            cleanupError.message
          )
        }
      }
    }

    return jsonResponse(
      context.request,
      {
        success: true,
        account: {
          id: createdUser.id,
          email: createdUser.email ?? email,
          credits,
          subscriptionStatus:
            credits > 0 ? 'active' : 'inactive',
          planId: defaultPlan.id,
          planName:
            defaultPlan.name ?? 'Default plan',
          createdAt: createdUser.created_at,
        },
      },
      201
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error(
      'ADMIN CREATE USER API ERROR:',
      message
    )

    return jsonResponse(
      context.request,
      {
        success: false,
        error: message,
      },
      500
    )
  }
}