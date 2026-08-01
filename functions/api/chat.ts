import { createClient } from '@supabase/supabase-js'

type Environment = {
  PERPLEXITY_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type ChatRequest = {
  modelId?: string
  message?: string
}

type AgentResponse = {
  id?: string
  model?: string
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cost?: {
      currency?: string
      input_cost?: number
      output_cost?: number
      total_cost?: number
      cache_creation_cost?: number
      cache_read_cost?: number
      tool_calls_cost?: number
    }
  }
  error?: {
    message?: string
  }
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

function extractAgentText(response: AgentResponse): string {
  const textParts: string[] = []

  for (const outputItem of response.output ?? []) {
    for (const contentItem of outputItem.content ?? []) {
      if (
        typeof contentItem.text === 'string' &&
        contentItem.text.trim()
      ) {
        textParts.push(contentItem.text.trim())
      }
    }
  }

  return textParts.join('\n\n')
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
    const perplexityKey = requireEnv(
      context.env.PERPLEXITY_API_KEY,
      'PERPLEXITY_API_KEY'
    )

    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

    /*
     * Read and validate the customer's Supabase access token.
     */
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

    /*
     * Validate the request body.
     */
    let requestBody: ChatRequest

    try {
      requestBody =
        (await context.request.json()) as ChatRequest
    } catch {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The request body is invalid.',
        },
        400
      )
    }

    const modelId = requestBody.modelId?.trim()
    const message = requestBody.message?.trim()

    if (!modelId) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'No AI model was selected.',
        },
        400
      )
    }

    if (!message) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Please enter a message.',
        },
        400
      )
    }

    if (message.length > 10000) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Your message is too long. The maximum is 10,000 characters.',
        },
        400
      )
    }

    /*
     * Load and validate the customer's profile.
     */
    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select(
        'id, credits, subscription_status, expiry_date'
      )
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw new Error(
        `Could not load the customer profile: ${profileError.message}`
      )
    }

    if (!profile) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Your customer profile was not found.',
        },
        403
      )
    }

    if (
      typeof profile.credits !== 'number' ||
      profile.credits <= 0
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'You do not have enough credits to send a message.',
        },
        403
      )
    }

    /*
     * Load and validate the subscription.
     */
    const {
      data: subscription,
      error: subscriptionError,
    } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_id, status, expires_at')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle()

    if (subscriptionError) {
      throw new Error(
        `Could not load the subscription: ${subscriptionError.message}`
      )
    }

    if (!subscription) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'No subscription was found.',
        },
        403
      )
    }

    if (subscription.status !== 'active') {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Your subscription is not active.',
        },
        403
      )
    }

    const expiryDate =
      subscription.expires_at ?? profile.expiry_date

    if (expiryDate) {
      const expiryTime = Date.parse(expiryDate)

      if (
        !Number.isNaN(expiryTime) &&
        expiryTime <= Date.now()
      ) {
        return jsonResponse(
          context.request,
          {
            success: false,
            error: 'Your subscription has expired.',
          },
          403
        )
      }
    }

    /*
     * Verify that the selected model exists and is enabled.
     */
    const {
      data: selectedModel,
      error: modelError,
    } = await supabaseAdmin
      .from('ai_models')
      .select(
        'id, name, provider, model_key, enabled'
      )
      .eq('id', modelId)
      .maybeSingle()

    if (modelError) {
      throw new Error(
        `Could not load the selected model: ${modelError.message}`
      )
    }

    if (!selectedModel || !selectedModel.enabled) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The selected AI model is currently unavailable.',
        },
        404
      )
    }

    /*
     * Verify that the model belongs to the customer's plan.
     */
    const {
      data: modelAccess,
      error: accessError,
    } = await supabaseAdmin
      .from('plan_models')
      .select('id')
      .eq('plan_id', subscription.plan_id)
      .eq('model_id', selectedModel.id)
      .maybeSingle()

    if (accessError) {
      throw new Error(
        `Could not verify model access: ${accessError.message}`
      )
    }

    if (!modelAccess) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'This AI model is not included in your plan.',
        },
        403
      )
    }

    /*
     * Send the message to the Perplexity Agent API.
     */
    const perplexityResponse = await fetch(
      'https://api.perplexity.ai/v1/agent',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel.model_key,
          input: message,
          max_output_tokens: 600,
          stream: false,
          store: false,
        }),
      }
    )

    const perplexityText =
      await perplexityResponse.text()

    let agentResponse: AgentResponse

    try {
      agentResponse = JSON.parse(
        perplexityText
      ) as AgentResponse
    } catch {
      throw new Error(
        'Perplexity returned an invalid response.'
      )
    }

    if (!perplexityResponse.ok) {
      const providerMessage =
        agentResponse.error?.message ||
        'The AI provider rejected the request.'

      return jsonResponse(
        context.request,
        {
          success: false,
          error: providerMessage,
          providerStatus: perplexityResponse.status,
        },
        502
      )
    }

    const reply = extractAgentText(agentResponse)

    if (!reply) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The AI provider returned an empty response.',
        },
        502
      )
    }

    /*
     * Credit deduction and message storage are deliberately
     * added after the basic API connection is verified.
     */
    return jsonResponse(context.request, {
      success: true,
      responseId: agentResponse.id ?? null,
      model: {
        id: selectedModel.id,
        name: selectedModel.name,
        provider: selectedModel.provider,
        modelKey: selectedModel.model_key,
      },
      reply,
      usage: agentResponse.usage ?? null,
      creditsRemaining: profile.credits,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error('CHAT API ERROR:', message)

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