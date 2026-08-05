import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type AdjustCreditsRequest = {
  customerUserId?: unknown
  amount?: unknown
  description?: unknown
}

type AdjustmentResult = {
  success: boolean
  customer_user_id: string
  credits_before: number
  adjustment: number
  credits_after: number
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-tools-portal-9h5.pages.dev',
]

const MAX_ADJUSTMENT = 1_000_000

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

    let body: AdjustCreditsRequest

    try {
      body =
        (await context.request.json()) as AdjustCreditsRequest
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

    const amount = body.amount

    const description =
      typeof body.description === 'string'
        ? body.description.trim().slice(0, 500)
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
      typeof amount !== 'number' ||
      !Number.isInteger(amount) ||
      amount === 0 ||
      Math.abs(amount) > MAX_ADJUSTMENT
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The adjustment must be a non-zero whole number between -1,000,000 and 1,000,000.',
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

    if (
      authenticatedUserError ||
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

    const {
      data: adjustmentData,
      error: adjustmentError,
    } = await supabaseAdmin.rpc(
      'admin_adjust_credits_v1',
      {
        p_admin_user_id: authenticatedUser.id,
        p_customer_user_id: customerUserId,
        p_amount: amount,
        p_description:
          description ||
          'Administrator credit adjustment',
      }
    )

    if (adjustmentError) {
      const normalizedMessage =
        adjustmentError.message.toLowerCase()

      let status = 400

      if (
        normalizedMessage.includes(
          'administrator access'
        )
      ) {
        status = 403
      } else if (
        normalizedMessage.includes('not found')
      ) {
        status = 404
      }

      return jsonResponse(
        context.request,
        {
          success: false,
          error: adjustmentError.message,
        },
        status
      )
    }

    const result =
      adjustmentData as AdjustmentResult | null

    if (
      !result ||
      result.success !== true ||
      typeof result.credits_before !== 'number' ||
      typeof result.credits_after !== 'number'
    ) {
      throw new Error(
        'The credit adjustment returned an invalid result.'
      )
    }

    return jsonResponse(context.request, {
      success: true,
      result: {
        customerUserId:
          result.customer_user_id,
        creditsBefore: result.credits_before,
        adjustment: result.adjustment,
        creditsAfter: result.credits_after,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error(
      'ADMIN ADJUST CREDITS API ERROR:',
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