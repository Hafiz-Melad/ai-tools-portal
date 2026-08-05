import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type DeleteUserRequest = {
  customerUserId?: unknown
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

    let body: DeleteUserRequest

    try {
      body =
        (await context.request.json()) as DeleteUserRequest
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
            'Administrators cannot delete their own account.',
        },
        400
      )
    }

    const {
      data: customerProfile,
      error: customerProfileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', customerUserId)
      .maybeSingle()

    if (customerProfileError) {
      throw new Error(
        `Could not verify the customer account: ${customerProfileError.message}`
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
            'Only customer accounts can be deleted from this page.',
        },
        400
      )
    }

    const {
      data: customerAuthData,
      error: customerAuthError,
    } = await supabaseAdmin.auth.admin.getUserById(
      customerUserId
    )

    if (
      customerAuthError ||
      !customerAuthData.user
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            customerAuthError?.message ||
            'The customer authentication account was not found.',
        },
        404
      )
    }

    const customerEmail =
      customerAuthData.user.email ?? null

    const { error: deleteAuthError } =
      await supabaseAdmin.auth.admin.deleteUser(
        customerUserId,
        false
      )

    if (deleteAuthError) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            `Could not delete the customer authentication account: ${deleteAuthError.message}`,
        },
        400
      )
    }

    const cleanupWarnings: string[] = []

    const { error: subscriptionCleanupError } =
      await supabaseAdmin
        .from('subscriptions')
        .delete()
        .eq('user_id', customerUserId)

    if (subscriptionCleanupError) {
      cleanupWarnings.push(
        `Subscription cleanup: ${subscriptionCleanupError.message}`
      )
    }

    const { error: profileCleanupError } =
      await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', customerUserId)

    if (profileCleanupError) {
      cleanupWarnings.push(
        `Profile cleanup: ${profileCleanupError.message}`
      )
    }

    if (cleanupWarnings.length > 0) {
      console.warn(
        'ADMIN DELETE USER CLEANUP WARNINGS:',
        cleanupWarnings
      )
    }

    return jsonResponse(context.request, {
      success: true,
      deletedAccount: {
        id: customerUserId,
        email: customerEmail,
      },
      cleanupWarnings,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error(
      'ADMIN DELETE USER API ERROR:',
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