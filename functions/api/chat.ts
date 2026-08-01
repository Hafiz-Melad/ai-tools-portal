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
  conversationId?: string | null
}

type CreditResult = {
  success: boolean
  credits_remaining: number
}

type ConversationMemory = {
  id: string
  provider_response_id: string | null
}

type AgentRequestBody = {
  model: string
  input: string
  max_output_tokens: number
  stream: boolean
  store: boolean
  previous_response_id?: string
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

/*
 * 10,000 customer credits represent $1 of API usage.
 * One credit represents $0.0001.
 */
const CREDITS_PER_USD = 10_000

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
     * Read and validate the customer's access token.
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

    const requestedConversationId =
      requestBody.conversationId?.trim() || null

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

    if (!isValidUuid(modelId)) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The selected model ID is invalid.',
        },
        400
      )
    }

    if (
      requestedConversationId &&
      !isValidUuid(requestedConversationId)
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The conversation ID is invalid.',
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

    if (message.length > 10_000) {
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
      .select('id, credits, expiry_date')
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

    if (
      typeof selectedModel.model_key !== 'string' ||
      !selectedModel.model_key.trim()
    ) {
      throw new Error(
        'The selected model does not have a valid provider model key.'
      )
    }

    /*
     * Verify that the selected model belongs to the plan.
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
     * Load the previous Perplexity response ID when this is
     * an existing conversation.
     *
     * The ownership and model checks prevent a customer from
     * continuing another customer's conversation.
     */
    let previousResponseId: string | null = null

    if (requestedConversationId) {
      const {
        data: conversationData,
        error: conversationError,
      } = await supabaseAdmin
        .from('conversations')
        .select('id, provider_response_id')
        .eq('id', requestedConversationId)
        .eq('user_id', user.id)
        .eq('model_id', selectedModel.id)
        .maybeSingle()

      if (conversationError) {
        throw new Error(
          `Could not load conversation memory: ${conversationError.message}`
        )
      }

      const conversation =
        conversationData as ConversationMemory | null

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

      if (
        typeof conversation.provider_response_id ===
          'string' &&
        conversation.provider_response_id.trim()
      ) {
        previousResponseId =
          conversation.provider_response_id.trim()
      }
    }

    /*
     * Prepare the Perplexity Agent API request.
     */
    const agentRequestBody: AgentRequestBody = {
      model: selectedModel.model_key,
      input: message,
      max_output_tokens: 600,
      stream: false,
      store: false,
    }

    if (previousResponseId) {
      agentRequestBody.previous_response_id =
        previousResponseId
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
        body: JSON.stringify(agentRequestBody),
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

    const providerResponseId =
      agentResponse.id?.trim()

    if (!providerResponseId) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The AI provider did not return a response ID.',
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
     * Convert the provider cost into customer credits.
     */
    const providerCostUsd = Number(
      agentResponse.usage?.cost?.total_cost ?? 0
    )

    if (
      !Number.isFinite(providerCostUsd) ||
      providerCostUsd < 0
    ) {
      throw new Error(
        'The AI provider returned invalid usage-cost information.'
      )
    }

    const creditsUsed = Math.max(
      1,
      Math.ceil(providerCostUsd * CREDITS_PER_USD)
    )

    /*
     * Atomically deduct credits and record the transaction.
     */
    const {
      data: creditRows,
      error: creditError,
    } = await supabaseAdmin.rpc('consume_credits', {
      p_user_id: user.id,
      p_amount: creditsUsed,
      p_model_id: selectedModel.id,
      p_description:
        `${selectedModel.name} usage — $${providerCostUsd.toFixed(6)}`,
    })

    if (creditError) {
      throw new Error(
        `Could not deduct credits: ${creditError.message}`
      )
    }

    const creditResult = (
      Array.isArray(creditRows)
        ? creditRows[0]
        : creditRows
    ) as CreditResult | null

    if (!creditResult?.success) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Your remaining balance is insufficient for this request.',
        },
        402
      )
    }

    /*
     * Save the exchange and the latest Perplexity response ID.
     *
     * New conversations receive their first provider response
     * ID. Existing conversations replace their stored response
     * ID with the newest one.
     */
    const {
      data: savedConversationId,
      error: historyError,
    } = await supabaseAdmin.rpc(
      'save_chat_exchange_v2',
      {
        p_user_id: user.id,
        p_model_id: selectedModel.id,
        p_user_message: message,
        p_assistant_message: reply,
        p_conversation_id:
          requestedConversationId,
        p_provider_response_id:
          providerResponseId,
      }
    )

    if (historyError) {
      throw new Error(
        `The reply was generated, but chat history could not be saved: ${historyError.message}`
      )
    }

    if (
      typeof savedConversationId !== 'string' ||
      !savedConversationId.trim()
    ) {
      throw new Error(
        'Chat history did not return a valid conversation ID.'
      )
    }

    return jsonResponse(context.request, {
      success: true,
      responseId: providerResponseId,
      conversationId: savedConversationId,
      memoryContinued: previousResponseId !== null,
      model: {
        id: selectedModel.id,
        name: selectedModel.name,
        provider: selectedModel.provider,
        modelKey: selectedModel.model_key,
      },
      reply,
      usage: agentResponse.usage ?? null,
      providerCostUsd,
      creditsUsed,
      creditsRemaining:
        creditResult.credits_remaining,
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