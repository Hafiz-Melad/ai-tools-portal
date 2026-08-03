import { createClient } from '@supabase/supabase-js'

type Environment = {
  PERPLEXITY_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
  waitUntil: (promise: Promise<unknown>) => void
}

type ChatRequest = {
  modelId?: string
  message?: string
  conversationId?: string | null
  attachmentIds?: unknown
}

type CreditResult = {
  success: boolean
  credits_remaining: number
}

type ConversationMemory = {
  id: string
  model_id: string
  provider_response_id: string | null
}

type SelectedModel = {
  id: string
  name: string
  provider: string
  model_key: string
  enabled: boolean
}

type AttachmentRecord = {
  id: string
  conversation_id: string | null
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  attachment_type: string
  status: string
}

type AgentInputTextContent = {
  type: 'input_text'
  text: string
}

type AgentInputImageContent = {
  type: 'input_image'
  image_url: string
}

type AgentInputContent =
  | AgentInputTextContent
  | AgentInputImageContent

type SaveChatExchangeResult = {
  conversation_id: string
  user_message_id: string
  assistant_message_id: string
}

type ConversationMessage = {
  role: string
  content: string
  created_at: string
}

type AgentInputMessage = {
  role: 'user' | 'assistant'
  content: string | AgentInputContent[]
}

type AgentRequestBody = {
  model: string
  input: string | AgentInputMessage[]
  max_output_tokens: number
  stream: boolean
  store: boolean
  previous_response_id?: string
}

type AgentUsage = {
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
  usage?: AgentUsage
  error?: {
    message?: string
  } | null
}

type AgentStreamEvent = {
  type?: string
  delta?: string
  response?: AgentResponse
  error?: {
    message?: string
  } | string | null
}

type StreamStartEvent = {
  type: 'start'
  model: {
    id: string
    name: string
    provider: string
    modelKey: string
  }
  modelSwitched: boolean
  continuityMethod:
    | 'provider_response'
    | 'transcript'
    | 'new_conversation'
}

type StreamDeltaEvent = {
  type: 'delta'
  delta: string
}

type StreamCompleteEvent = {
  type: 'complete'
  responseId: string
  conversationId: string
  modelSwitched: boolean
  continuityMethod:
    | 'provider_response'
    | 'transcript'
    | 'new_conversation'
  usage: AgentUsage | null
  providerCostUsd: number
  creditsUsed: number
  creditsRemaining: number
}

type StreamErrorEvent = {
  type: 'error'
  error: string
}

type ClientStreamEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamCompleteEvent
  | StreamErrorEvent

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

const ATTACHMENT_BUCKET = 'chat-attachments'
const MAX_ATTACHMENTS_PER_MESSAGE = 4
const MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024
const SIGNED_IMAGE_URL_LIFETIME_SECONDS = 10 * 60

const supportedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

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

function normalizeAttachmentIds(
  value: unknown
): {
  attachmentIds: string[]
  error: string | null
} {
  if (value === undefined || value === null) {
    return {
      attachmentIds: [],
      error: null,
    }
  }

  if (!Array.isArray(value)) {
    return {
      attachmentIds: [],
      error:
        'The attachment list has an invalid format.',
    }
  }

  const attachmentIds: string[] = []

  for (const item of value) {
    if (typeof item !== 'string') {
      return {
        attachmentIds: [],
        error:
          'The attachment list contains an invalid ID.',
      }
    }

    const attachmentId = item.trim()

    if (!isValidUuid(attachmentId)) {
      return {
        attachmentIds: [],
        error:
          'The attachment list contains an invalid ID.',
      }
    }

    if (!attachmentIds.includes(attachmentId)) {
      attachmentIds.push(attachmentId)
    }
  }

  if (
    attachmentIds.length >
    MAX_ATTACHMENTS_PER_MESSAGE
  ) {
    return {
      attachmentIds: [],
      error:
        `A maximum of ${MAX_ATTACHMENTS_PER_MESSAGE} images can be attached to one message.`,
    }
  }

  return {
    attachmentIds,
    error: null,
  }
}

function getCorsHeaders(
  request: Request
): Record<string, string> {
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

function getStreamHeaders(
  request: Request
): Record<string, string> {
  return {
    ...getCorsHeaders(request),
    'Content-Type':
      'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
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

function extractAgentText(
  response: AgentResponse
): string {
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

function toAgentTranscript(
  messages: ConversationMessage[],
  newUserContent: string | AgentInputContent[]
): AgentInputMessage[] {
  const transcript: AgentInputMessage[] = []

  for (const savedMessage of messages) {
    if (
      savedMessage.role !== 'user' &&
      savedMessage.role !== 'assistant'
    ) {
      continue
    }

    const content = savedMessage.content?.trim()

    if (!content) {
      continue
    }

    transcript.push({
      role: savedMessage.role,
      content,
    })
  }

  transcript.push({
    role: 'user',
    content: newUserContent,
  })

  return transcript
}

function getProviderErrorMessage(
  event: AgentStreamEvent
): string | null {
  if (typeof event.error === 'string') {
    return event.error.trim() || null
  }

  if (
    event.error &&
    typeof event.error.message === 'string'
  ) {
    return event.error.message.trim() || null
  }

  if (
    event.response?.error &&
    typeof event.response.error.message === 'string'
  ) {
    return event.response.error.message.trim() || null
  }

  return null
}

function parseSseDataBlock(
  block: string
): AgentStreamEvent | null {
  const dataLines: string[] = []

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  const data = dataLines.join('\n').trim()

  if (!data || data === '[DONE]') {
    return null
  }

  try {
    return JSON.parse(data) as AgentStreamEvent
  } catch {
    throw new Error(
      'The AI provider returned an invalid streaming event.'
    )
  }
}

function splitSseBlocks(buffer: string): {
  blocks: string[]
  remainder: string
} {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const remainder = parts.pop() ?? ''

  return {
    blocks: parts,
    remainder,
  }
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
     * Store the authenticated user's ID as a non-null primitive.
     * TypeScript does not preserve object narrowing inside nested
     * asynchronous functions.
     */
    const authenticatedUserId = user.id

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

    const {
      attachmentIds,
      error: attachmentIdError,
    } = normalizeAttachmentIds(
      requestBody.attachmentIds
    )

    if (attachmentIdError) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: attachmentIdError,
        },
        400
      )
    }

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

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id, credits')
      .eq('id', authenticatedUserId)
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

    const {
      data: subscription,
      error: subscriptionError,
    } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_id, status')
      .eq('user_id', authenticatedUserId)
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
     * Capture the validated model in a non-null typed value.
     * This prevents "selectedModel is possibly null" inside
     * the streaming callback.
     */
    const resolvedModel: SelectedModel =
      selectedModel as SelectedModel

    const {
      data: modelAccess,
      error: accessError,
    } = await supabaseAdmin
      .from('plan_models')
      .select('id')
      .eq('plan_id', subscription.plan_id)
      .eq('model_id', resolvedModel.id)
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

    let previousResponseId: string | null = null
    let conversationMessages: ConversationMessage[] = []
    let modelSwitched = false

    if (requestedConversationId) {
      const {
        data: conversationData,
        error: conversationError,
      } = await supabaseAdmin
        .from('conversations')
        .select(
          'id, model_id, provider_response_id'
        )
        .eq('id', requestedConversationId)
        .eq('user_id', authenticatedUserId)
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

      modelSwitched =
        conversation.model_id !== resolvedModel.id

      if (
        !modelSwitched &&
        typeof conversation.provider_response_id ===
          'string' &&
        conversation.provider_response_id.trim()
      ) {
        previousResponseId =
          conversation.provider_response_id.trim()
      } else {
        const {
          data: messageRows,
          error: transcriptError,
        } = await supabaseAdmin
          .from('messages')
          .select('role, content, created_at')
          .eq(
            'conversation_id',
            requestedConversationId
          )
          .in('role', ['user', 'assistant'])
          .order('created_at', {
            ascending: true,
          })

        if (transcriptError) {
          throw new Error(
            `Could not load the conversation transcript: ${transcriptError.message}`
          )
        }

        conversationMessages =
          (messageRows ?? []) as ConversationMessage[]
      }
    }

    let signedImageUrls: string[] = []

    if (attachmentIds.length > 0) {
      const {
        data: attachmentRows,
        error: attachmentError,
      } = await supabaseAdmin
        .from('chat_attachments')
        .select(
          'id, conversation_id, storage_path, file_name, mime_type, size_bytes, attachment_type, status'
        )
        .in('id', attachmentIds)
        .eq('user_id', authenticatedUserId)

      if (attachmentError) {
        throw new Error(
          `Could not load the selected attachments: ${attachmentError.message}`
        )
      }

      const attachments =
        (attachmentRows ?? []) as AttachmentRecord[]

      if (
        attachments.length !== attachmentIds.length
      ) {
        return jsonResponse(
          context.request,
          {
            success: false,
            error:
              'One or more attachments were not found or access was denied.',
          },
          400
        )
      }

      const attachmentById = new Map(
        attachments.map((attachment) => [
          attachment.id,
          attachment,
        ])
      )

      const orderedAttachments: AttachmentRecord[] =
        []

      for (const attachmentId of attachmentIds) {
        const attachment =
          attachmentById.get(attachmentId)

        if (!attachment) {
          return jsonResponse(
            context.request,
            {
              success: false,
              error:
                'One or more attachments could not be resolved.',
            },
            400
          )
        }

        if (
          attachment.status !== 'pending' ||
          attachment.attachment_type !== 'image'
        ) {
          return jsonResponse(
            context.request,
            {
              success: false,
              error:
                'One or more attachments are no longer available for this message.',
            },
            400
          )
        }

        if (
          !supportedImageMimeTypes.has(
            attachment.mime_type
          )
        ) {
          return jsonResponse(
            context.request,
            {
              success: false,
              error:
                `The image type for "${attachment.file_name}" is not supported.`,
            },
            415
          )
        }

        if (
          !Number.isFinite(attachment.size_bytes) ||
          attachment.size_bytes <= 0 ||
          attachment.size_bytes >
            MAX_ATTACHMENT_SIZE_BYTES
        ) {
          return jsonResponse(
            context.request,
            {
              success: false,
              error:
                `The image "${attachment.file_name}" has an invalid file size.`,
            },
            400
          )
        }

        if (
          attachment.conversation_id !== null &&
          attachment.conversation_id !==
            requestedConversationId
        ) {
          return jsonResponse(
            context.request,
            {
              success: false,
              error:
                'An attachment belongs to a different conversation.',
            },
            400
          )
        }

        orderedAttachments.push(attachment)
      }

      const {
        data: signedRows,
        error: signedUrlError,
      } = await supabaseAdmin.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrls(
          orderedAttachments.map(
            (attachment) =>
              attachment.storage_path
          ),
          SIGNED_IMAGE_URL_LIFETIME_SECONDS
        )

      if (signedUrlError) {
        throw new Error(
          `Could not prepare the images for analysis: ${signedUrlError.message}`
        )
      }

      const signedResults = (
        signedRows ?? []
      ) as Array<{
        path?: string
        signedUrl?: string
        error?: string
      }>

      if (
        signedResults.length !==
        orderedAttachments.length
      ) {
        throw new Error(
          'The image service did not return every required signed URL.'
        )
      }

      signedImageUrls = signedResults.map(
        (signedResult, index) => {
          const signedUrl =
            signedResult.signedUrl?.trim()

          if (!signedUrl || signedResult.error) {
            const fileName =
              orderedAttachments[index]?.file_name ??
              'attachment'

            throw new Error(
              `Could not prepare "${fileName}" for image analysis.`
            )
          }

          return signedUrl
        }
      )
    }

    const continuityMethod:
      | 'provider_response'
      | 'transcript'
      | 'new_conversation' =
      previousResponseId !== null
        ? 'provider_response'
        : requestedConversationId
          ? 'transcript'
          : 'new_conversation'

    const currentUserContent:
      | string
      | AgentInputContent[] =
      signedImageUrls.length > 0
        ? [
            {
              type: 'input_text',
              text: message,
            },
            ...signedImageUrls.map(
              (signedImageUrl): AgentInputImageContent => ({
                type: 'input_image',
                image_url: signedImageUrl,
              })
            ),
          ]
        : message

    const agentInput:
      | string
      | AgentInputMessage[] =
      previousResponseId !== null
        ? signedImageUrls.length > 0
          ? [
              {
                role: 'user',
                content: currentUserContent,
              },
            ]
          : message
        : requestedConversationId
          ? toAgentTranscript(
              conversationMessages,
              currentUserContent
            )
          : signedImageUrls.length > 0
            ? [
                {
                  role: 'user',
                  content: currentUserContent,
                },
              ]
            : message

    const agentRequestBody: AgentRequestBody = {
      model: resolvedModel.model_key,
      input: agentInput,
      max_output_tokens: 600,
      stream: true,
      store: false,
    }

    if (previousResponseId) {
      agentRequestBody.previous_response_id =
        previousResponseId
    }

    /*
     * Contact the provider before opening the client stream.
     * Validation and provider-level HTTP errors remain normal JSON
     * responses, while successful generations become NDJSON streams.
     */
    const perplexityResponse = await fetch(
      'https://api.perplexity.ai/v1/agent',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(agentRequestBody),
      }
    )

    if (!perplexityResponse.ok) {
      const providerText =
        await perplexityResponse.text()

      let providerMessage =
        'The AI provider rejected the request.'

      try {
        const parsed = JSON.parse(providerText) as {
          error?: {
            message?: string
          }
        }

        if (parsed.error?.message?.trim()) {
          providerMessage =
            parsed.error.message.trim()
        }
      } catch {
        if (providerText.trim()) {
          providerMessage = providerText.trim()
        }
      }

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

    if (!perplexityResponse.body) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The AI provider did not return a response stream.',
        },
        502
      )
    }

    const transform =
      new TransformStream<Uint8Array, Uint8Array>()

    const writer = transform.writable.getWriter()
    const encoder = new TextEncoder()

    let clientStreamOpen = true

    async function sendClientEvent(
      event: ClientStreamEvent
    ): Promise<void> {
      if (!clientStreamOpen) {
        return
      }

      try {
        await writer.write(
          encoder.encode(`${JSON.stringify(event)}\n`)
        )
      } catch {
        /*
         * The browser may close the page or cancel the request.
         * Continue processing so billing and history stay consistent.
         */
        clientStreamOpen = false
      }
    }

    async function closeClientStream(): Promise<void> {
      if (!clientStreamOpen) {
        return
      }

      try {
        await writer.close()
      } catch {
        clientStreamOpen = false
      }
    }

    async function processProviderStream(): Promise<void> {
      let reply = ''
      let completedResponse: AgentResponse | null = null
      let sseBuffer = ''

      const reader = perplexityResponse.body!.getReader()
      const decoder = new TextDecoder()

      try {
        await sendClientEvent({
          type: 'start',
          model: {
            id: resolvedModel.id,
            name: resolvedModel.name,
            provider: resolvedModel.provider,
            modelKey: resolvedModel.model_key,
          },
          modelSwitched,
          continuityMethod,
        })

        while (true) {
          const { value, done } = await reader.read()

          if (done) {
            sseBuffer += decoder.decode()
            break
          }

          sseBuffer += decoder.decode(value, {
            stream: true,
          })

          const {
            blocks,
            remainder,
          } = splitSseBlocks(sseBuffer)

          sseBuffer = remainder

          for (const block of blocks) {
            const event = parseSseDataBlock(block)

            if (!event) {
              continue
            }

            const providerError =
              getProviderErrorMessage(event)

            if (
              providerError &&
              event.type !== 'response.completed'
            ) {
              throw new Error(providerError)
            }

            if (
              event.type ===
                'response.output_text.delta' &&
              typeof event.delta === 'string' &&
              event.delta
            ) {
              reply += event.delta

              await sendClientEvent({
                type: 'delta',
                delta: event.delta,
              })
            }

            if (
              event.type === 'response.completed' &&
              event.response
            ) {
              completedResponse = event.response
            }

            if (
              event.type === 'response.failed' ||
              event.type === 'error'
            ) {
              throw new Error(
                providerError ||
                  'The AI provider could not complete the response.'
              )
            }
          }
        }

        if (sseBuffer.trim()) {
          const finalEvent =
            parseSseDataBlock(sseBuffer)

          if (finalEvent) {
            const providerError =
              getProviderErrorMessage(finalEvent)

            if (
              finalEvent.type ===
                'response.output_text.delta' &&
              typeof finalEvent.delta === 'string' &&
              finalEvent.delta
            ) {
              reply += finalEvent.delta

              await sendClientEvent({
                type: 'delta',
                delta: finalEvent.delta,
              })
            }

            if (
              finalEvent.type ===
                'response.completed' &&
              finalEvent.response
            ) {
              completedResponse =
                finalEvent.response
            }

            if (
              providerError &&
              finalEvent.type !==
                'response.completed'
            ) {
              throw new Error(providerError)
            }
          }
        }

        const completedText = completedResponse
          ? extractAgentText(completedResponse)
          : ''

        const finalReply =
          completedText.trim() || reply.trim()

        if (!finalReply) {
          throw new Error(
            'The AI provider returned an empty response.'
          )
        }

        const providerResponseId =
          completedResponse?.id?.trim()

        if (!providerResponseId) {
          throw new Error(
            'The AI provider did not return a response ID.'
          )
        }

        const providerCostUsd = Number(
          completedResponse?.usage?.cost
            ?.total_cost ?? 0
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
          Math.ceil(
            providerCostUsd * CREDITS_PER_USD
          )
        )

        const {
          data: creditRows,
          error: creditError,
        } = await supabaseAdmin.rpc(
          'consume_credits',
          {
            p_user_id: authenticatedUserId,
            p_amount: creditsUsed,
            p_model_id: resolvedModel.id,
            p_description:
              `${resolvedModel.name} usage — $${providerCostUsd.toFixed(6)}`,
          }
        )

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
          throw new Error(
            'Your remaining balance is insufficient for this request.'
          )
        }

        const {
          data: savedExchangeData,
          error: historyError,
        } = await supabaseAdmin.rpc(
          'save_chat_exchange_v4',
          {
            p_user_id: authenticatedUserId,
            p_model_id: resolvedModel.id,
            p_user_message: message,
            p_assistant_message: finalReply,
            p_conversation_id:
              requestedConversationId,
            p_provider_response_id:
              providerResponseId,
            p_attachment_ids: attachmentIds,
          }
        )

        if (historyError) {
          throw new Error(
            `The reply was generated, but chat history could not be saved: ${historyError.message}`
          )
        }

        const savedExchange = (
          Array.isArray(savedExchangeData)
            ? savedExchangeData[0]
            : savedExchangeData
        ) as SaveChatExchangeResult | null

        const savedConversationId =
          savedExchange?.conversation_id?.trim()

        if (!savedConversationId) {
          throw new Error(
            'Chat history did not return a valid conversation ID.'
          )
        }

        await sendClientEvent({
          type: 'complete',
          responseId: providerResponseId,
          conversationId:
            savedConversationId,
          modelSwitched,
          continuityMethod,
          usage:
            completedResponse?.usage ?? null,
          providerCostUsd,
          creditsUsed,
          creditsRemaining:
            creditResult.credits_remaining,
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'An unknown streaming error occurred.'

        console.error(
          'CHAT STREAM API ERROR:',
          errorMessage
        )

        await sendClientEvent({
          type: 'error',
          error: errorMessage,
        })
      } finally {
        try {
          reader.releaseLock()
        } catch {
          // No action required.
        }

        await closeClientStream()
      }
    }

    const processingPromise = processProviderStream()

    context.waitUntil(processingPromise)

    return new Response(transform.readable, {
      status: 200,
      headers: getStreamHeaders(context.request),
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error('CHAT STREAM SETUP ERROR:', message)

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