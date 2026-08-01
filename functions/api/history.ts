import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export async function onRequestGet(
  context: FunctionContext
): Promise<Response> {
  try {
    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

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
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (userError || !user) {
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

    const requestUrl = new URL(context.request.url)

    const conversationId =
      requestUrl.searchParams
        .get('conversationId')
        ?.trim() || null

    /*
     * No conversation ID:
     * return the customer's conversation list.
     */
    if (!conversationId) {
      const {
        data: conversations,
        error: conversationsError,
      } = await supabaseAdmin
        .from('conversations')
        .select(`
          id,
          title,
          model_id,
          created_at,
          ai_models (
            id,
            name,
            provider
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', {
          ascending: false,
        })
        .limit(50)

      if (conversationsError) {
        throw new Error(
          `Could not load conversations: ${conversationsError.message}`
        )
      }

      return jsonResponse(context.request, {
        success: true,
        conversations: conversations ?? [],
      })
    }

    if (!isValidUuid(conversationId)) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The conversation ID is invalid.',
        },
        400
      )
    }

    /*
     * A conversation ID was supplied:
     * verify ownership and return its messages.
     */
    const {
      data: conversation,
      error: conversationError,
    } = await supabaseAdmin
      .from('conversations')
      .select(`
        id,
        title,
        model_id,
        created_at,
        ai_models (
          id,
          name,
          provider
        )
      `)
      .eq('id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (conversationError) {
      throw new Error(
        `Could not load the conversation: ${conversationError.message}`
      )
    }

    if (!conversation) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The conversation was not found or access was denied.',
        },
        404
      )
    }

    const {
      data: messages,
      error: messagesError,
    } = await supabaseAdmin
      .from('messages')
      .select(`
        id,
        role,
        content,
        created_at
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', {
        ascending: true,
      })

    if (messagesError) {
      throw new Error(
        `Could not load conversation messages: ${messagesError.message}`
      )
    }

    return jsonResponse(context.request, {
      success: true,
      conversation,
      messages: messages ?? [],
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error('HISTORY API ERROR:', message)

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