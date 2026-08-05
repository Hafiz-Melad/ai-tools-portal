import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type SubscriptionStatus = 'active' | 'inactive'

type SetSubscriptionStatusRequest = {
  customerUserId?: unknown
  status?: unknown
}

type SubscriptionRow = {
  id: string
  status: string
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

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
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

    let body: SetSubscriptionStatusRequest

    try {
      body =
        (await context.request.json()) as SetSubscriptionStatusRequest
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

    const customerUserId =
      typeof body.customerUserId === 'string'
        ? body.customerUserId.trim()
        : ''

    const requestedStatus =
      typeof body.status === 'string'
        ? body.status.trim().toLowerCase()
        : ''

    if (
      !customerUserId ||
      !isValidUuid(customerUserId)
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The customer user ID is invalid.',
        },
        400
      )
    }

    if (
      requestedStatus !== 'active' &&
      requestedStatus !== 'inactive'
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Subscription status must be active or inactive.',
        },
        400
      )
    }

    const nextStatus =
      requestedStatus as SubscriptionStatus

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
      error: authenticationError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (
      authenticationError ||
      !authenticatedUser
    ) {
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

    if (authenticatedUser.id === customerUserId) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Administrators cannot change their own subscription status.',
        },
        400
      )
    }

    const {
      data: customerProfile,
      error: customerProfileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id, role, credits, subscription_status')
      .eq('id', customerUserId)
      .maybeSingle()

    if (customerProfileError) {
      throw new Error(
        `Could not load the customer profile: ${customerProfileError.message}`
      )
    }

    if (!customerProfile) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The customer profile was not found.',
        },
        404
      )
    }

    if (customerProfile.role !== 'customer') {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Subscription access can only be changed for customer accounts.',
        },
        400
      )
    }

    const credits = Number(customerProfile.credits ?? 0)

    if (nextStatus === 'active' && credits <= 0) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Add credits before activating this customer.',
        },
        400
      )
    }

    const {
      data: subscriptionRows,
      error: subscriptionReadError,
    } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', customerUserId)

    if (subscriptionReadError) {
      throw new Error(
        `Could not load the customer subscription: ${subscriptionReadError.message}`
      )
    }

    const existingSubscriptions =
      (subscriptionRows ?? []) as SubscriptionRow[]

    if (existingSubscriptions.length === 0) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'No subscription record exists for this customer.',
        },
        404
      )
    }

    const previousProfileStatus =
      typeof customerProfile.subscription_status ===
      'string'
        ? customerProfile.subscription_status
        : 'inactive'

    const { error: subscriptionUpdateError } =
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: nextStatus,
        })
        .eq('user_id', customerUserId)

    if (subscriptionUpdateError) {
      throw new Error(
        `Could not update the subscription record: ${subscriptionUpdateError.message}`
      )
    }

    const profileUpdate: {
      subscription_status: SubscriptionStatus
      credits_exhausted_at?: null
    } = {
      subscription_status: nextStatus,
    }

    if (nextStatus === 'active') {
      profileUpdate.credits_exhausted_at = null
    }

    const { error: profileUpdateError } =
      await supabaseAdmin
        .from('profiles')
        .update(profileUpdate)
        .eq('id', customerUserId)

    if (profileUpdateError) {
      const rollbackErrors: string[] = []

      for (const subscription of existingSubscriptions) {
        const { error: rollbackError } =
          await supabaseAdmin
            .from('subscriptions')
            .update({
              status: subscription.status,
            })
            .eq('id', subscription.id)

        if (rollbackError) {
          rollbackErrors.push(rollbackError.message)
        }
      }

      if (rollbackErrors.length > 0) {
        console.error(
          'SUBSCRIPTION STATUS ROLLBACK ERRORS:',
          rollbackErrors
        )
      }

      throw new Error(
        `Could not update the customer profile: ${profileUpdateError.message}`
      )
    }

    return jsonResponse(context.request, {
      success: true,
      result: {
        customerUserId,
        previousStatus: previousProfileStatus,
        subscriptionStatus: nextStatus,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error(
      'ADMIN SET SUBSCRIPTION STATUS API ERROR:',
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