import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'

import { supabase } from '../lib/supabase'

type Profile = {
  full_name: string
  credits: number
}

type AIModel = {
  id: string
  name: string
  provider: string
  model_key: string
  description: string
  enabled: boolean
}

type MessageAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  previewUrl: string
}

type PendingAttachment = MessageAttachment & {
  localId: string
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachment[]
}

type AttachmentUploadResponse = {
  success: boolean
  error?: string
  attachment?: {
    id: string
    fileName: string
    mimeType: string
    sizeBytes: number
    attachmentType: 'image' | 'document'
    conversationId: string | null
    status: 'pending'
  }
}

type StoredAttachmentRow = {
  id: string
  message_id: string | null
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

type ChatErrorResponse = {
  success?: boolean
  error?: string
}

type ChatStreamEvent =
  | {
      type: 'start'
      model?: {
        id: string
        name: string
        provider: string
        modelKey: string
      }
    }
  | {
      type: 'delta'
      delta: string
    }
  | {
      type: 'complete'
      responseId: string
      conversationId: string
      creditsRemaining: number
      creditsUsed: number
      providerCostUsd: number
    }
  | {
      type: 'error'
      error: string
    }

type ChatStreamCompleteEvent = Extract<
  ChatStreamEvent,
  { type: 'complete' }
>

type HistoryConversation = {
  id: string
  title: string | null
  model_id: string
  created_at: string
}

type HistoryMessage = {
  id: string
  role: string
  content: string
  created_at: string
}

type HistoryApiResponse = {
  success: boolean
  error?: string
  conversation?: HistoryConversation
  conversations?: HistoryConversation[]
  messages?: HistoryMessage[]
}

type SidebarItemProps = {
  label: string
  icon: ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  badge?: string
}

const CHAT_STREAM_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/chat-stream'
  : '/api/chat-stream'

const HISTORY_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/history'
  : '/api/history'

const UPLOAD_ATTACHMENT_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/upload-attachment'
  : '/api/upload-attachment'

const MAX_ATTACHMENTS_PER_MESSAGE = 4
const MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024

const supportedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name:
    | 'plus'
    | 'chat'
    | 'folder'
    | 'artifact'
    | 'code'
    | 'sliders'
    | 'palette'
    | 'spark'
    | 'send'
    | 'copy'
    | 'check'
    | 'logout'
    | 'menu'
    | 'close'
    | 'mic'
    | 'wave'
  className?: string
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  const paths: Record<typeof name, ReactNode> = {
    plus: (
      <>
        <path d="M12 5v14" {...common} />
        <path d="M5 12h14" {...common} />
      </>
    ),
    chat: (
      <path
        d="M5.4 17.7 3.7 20v-4.7A8.1 8.1 0 1 1 20.2 12a8.1 8.1 0 0 1-8.2 8.1c-2.4 0-4.6-.8-6.6-2.4Z"
        {...common}
      />
    ),
    folder: (
      <>
        <path
          d="M3.5 7.5h6l1.7 2h9.3v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Z"
          {...common}
        />
        <path
          d="M5 7.5V5.8a2 2 0 0 1 2-2h3.4l1.6 2H19"
          {...common}
        />
      </>
    ),
    artifact: (
      <>
        <path
          d="M4.2 7.2 12 3l7.8 4.2v9.6L12 21l-7.8-4.2V7.2Z"
          {...common}
        />
        <path d="m4.6 7.4 7.4 4 7.4-4" {...common} />
        <path d="M12 11.4V21" {...common} />
      </>
    ),
    code: (
      <>
        <path d="m8.2 7.2-4 4.8 4 4.8" {...common} />
        <path d="m15.8 7.2 4 4.8-4 4.8" {...common} />
        <path d="m13.7 4.8-3.4 14.4" {...common} />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h10" {...common} />
        <path d="M18 7h2" {...common} />
        <path d="M4 17h2" {...common} />
        <path d="M10 17h10" {...common} />
        <circle cx="16" cy="7" r="2" {...common} />
        <circle cx="8" cy="17" r="2" {...common} />
      </>
    ),
    palette: (
      <>
        <path
          d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a1.9 1.9 0 0 0 1.5-3.1 1.9 1.9 0 0 1 1.5-3.1h1.4A3.5 3.5 0 0 0 21 11.1 8.1 8.1 0 0 0 12 3.2Z"
          {...common}
        />
        <circle cx="7.5" cy="10" r=".8" fill="currentColor" />
        <circle cx="10" cy="6.8" r=".8" fill="currentColor" />
        <circle cx="14.2" cy="6.8" r=".8" fill="currentColor" />
      </>
    ),
    spark: (
      <>
        <path
          d="M12 2.8c.5 4.8 2.4 6.9 7.2 7.4-4.8.5-6.7 2.6-7.2 7.4-.5-4.8-2.4-6.9-7.2-7.4 4.8-.5 6.7-2.6 7.2-7.4Z"
          fill="currentColor"
          stroke="none"
        />
        <path
          d="M19.1 15.7c.2 1.8.9 2.6 2.7 2.8-1.8.2-2.5 1-2.7 2.8-.2-1.8-.9-2.6-2.7-2.8 1.8-.2 2.5-1 2.7-2.8Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
    send: (
      <>
        <path d="m5 12 14-7-4.2 14-3-5-6.8-2Z" {...common} />
        <path d="m11.8 14 3.5-3.5" {...common} />
      </>
    ),
    copy: (
      <>
        <rect
          x="8"
          y="8"
          width="11"
          height="11"
          rx="2"
          {...common}
        />
        <path
          d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
          {...common}
        />
      </>
    ),
    check: (
      <path d="m5 12.5 4.2 4.2L19 7" {...common} />
    ),
    logout: (
      <>
        <path d="M10 5H5.5v14H10" {...common} />
        <path d="M13 8.5 16.5 12 13 15.5" {...common} />
        <path d="M8 12h8.5" {...common} />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16" {...common} />
        <path d="M4 12h16" {...common} />
        <path d="M4 17h16" {...common} />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" {...common} />
        <path d="m18 6-12 12" {...common} />
      </>
    ),
    mic: (
      <>
        <rect
          x="9"
          y="3.5"
          width="6"
          height="11"
          rx="3"
          {...common}
        />
        <path d="M6.8 11.5a5.2 5.2 0 0 0 10.4 0" {...common} />
        <path d="M12 16.7v3.8" {...common} />
      </>
    ),
    wave: (
      <>
        <path d="M4 10v4" {...common} />
        <path d="M7.2 7.5v9" {...common} />
        <path d="M10.4 5v14" {...common} />
        <path d="M13.6 8.5v7" {...common} />
        <path d="M16.8 6.5v11" {...common} />
        <path d="M20 10v4" {...common} />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths[name]}
    </svg>
  )
}

function SidebarItem({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  badge,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
        active
          ? 'bg-[#2a2a28] text-[#f2eee6]'
          : 'text-[#ded8cf] hover:bg-[#292927]',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="flex h-5 w-5 items-center justify-center text-[#d9d3ca]">
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge && (
        <span className="rounded-full border border-[#4b4945] px-2 py-0.5 text-[10px] text-[#aaa39a]">
          {badge}
        </span>
      )}
    </button>
  )
}

function normalizeModelRelation(
  value: unknown
): AIModel | null {
  if (Array.isArray(value)) {
    return (value[0] as AIModel | undefined) ?? null
  }

  return (value as AIModel | null) ?? null
}

function getInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return 'U'
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatConversationDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(
    sizeBytes /
    (1024 * 1024)
  ).toFixed(1)} MB`
}

function Chat() {
  const { modelId: modelIdFromUrl } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const conversationFromUrl = useMemo<string>(
    () =>
      new URLSearchParams(location.search)
        .get('conversation')
        ?.trim() ?? '',
    [location.search]
  )

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null)

  const fileInputRef =
    useRef<HTMLInputElement | null>(null)

  const objectPreviewUrlsRef =
    useRef<Set<string>>(new Set())

  const loadedConversationIdRef =
    useRef<string | null>(null)

  const pendingPromptRef =
    useRef<string | null>(null)

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [models, setModels] =
    useState<AIModel[]>([])

  const [activeModelId, setActiveModelId] =
    useState(modelIdFromUrl ?? '')

  const [messages, setMessages] =
    useState<ChatMessage[]>([])

  const [conversations, setConversations] =
    useState<HistoryConversation[]>([])

  const [message, setMessage] = useState('')

  const [
    pendingAttachments,
    setPendingAttachments,
  ] = useState<PendingAttachment[]>([])

  const [bootstrapLoading, setBootstrapLoading] =
    useState(true)

  const [
    conversationLoading,
    setConversationLoading,
  ] = useState(false)

  const [sending, setSending] = useState(false)

  const [
    streamingMessageId,
    setStreamingMessageId,
  ] = useState<string | null>(null)

  const [sidebarOpen, setSidebarOpen] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [conversationId, setConversationId] =
    useState<string | null>(null)

  const [conversationTitle, setConversationTitle] =
    useState<string | null>(null)

  const [creditsRemaining, setCreditsRemaining] =
    useState<number | null>(null)

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string | null>(null)

  const [lastCreditsUsed, setLastCreditsUsed] =
    useState<number | null>(null)

  const [copiedMessageId, setCopiedMessageId] =
    useState<string | null>(null)

  const [signingOut, setSigningOut] =
    useState(false)

  const activeModel = useMemo(
    () =>
      models.find(
        (candidate) =>
          candidate.id === activeModelId
      ) ?? null,
    [models, activeModelId]
  )

  const hasCredits =
    typeof creditsRemaining === 'number' &&
    creditsRemaining > 0

  const subscriptionIsActive =
    subscriptionStatus === 'active'

  const canSendMessages =
    hasCredits &&
    subscriptionIsActive &&
    activeModel !== null

  const attachmentUploadInProgress =
    pendingAttachments.some(
      (attachment) =>
        attachment.status === 'uploading'
    )

  const readyAttachments =
    pendingAttachments.filter(
      (attachment) =>
        attachment.status === 'ready'
    )

  const canSubmitMessage =
    canSendMessages &&
    !sending &&
    !bootstrapLoading &&
    !conversationLoading &&
    !attachmentUploadInProgress &&
    (
      message.trim().length > 0 ||
      readyAttachments.length > 0
    )

  const accessMessage = !hasCredits
    ? 'No credits remain on this account. Contact the administrator to add credits.'
    : !subscriptionIsActive
      ? 'This Claude subscription is inactive.'
      : null

  useEffect(() => {
    return () => {
      for (
        const previewUrl of
        objectPreviewUrlsRef.current
      ) {
        URL.revokeObjectURL(previewUrl)
      }

      objectPreviewUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrapChat() {
      try {
        setBootstrapLoading(true)
        setError(null)

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.user) {
          throw new Error(
            'You must log in first.'
          )
        }

        const user = session.user

        const [
          profileResult,
          subscriptionResult,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, credits')
            .eq('id', user.id)
            .single(),

          supabase
            .from('subscriptions')
            .select('plan_id, status')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
        ])

        if (profileResult.error) {
          throw profileResult.error
        }

        if (subscriptionResult.error) {
          throw subscriptionResult.error
        }

        if (!subscriptionResult.data) {
          throw new Error(
            'No subscription was found.'
          )
        }

        const subscription =
          subscriptionResult.data

        const {
          data: modelRows,
          error: modelError,
        } = await supabase
          .from('plan_models')
          .select(`
            ai_models (
              id,
              name,
              provider,
              model_key,
              description,
              enabled
            )
          `)
          .eq('plan_id', subscription.plan_id)

        if (modelError) {
          throw modelError
        }

        const availableModels = (modelRows ?? [])
          .map((item: { ai_models?: unknown }) =>
            normalizeModelRelation(item.ai_models)
          )
          .filter(
            (candidate): candidate is AIModel =>
              candidate !== null &&
              candidate.enabled === true &&
              (
                candidate.provider.toLowerCase() ===
                  'anthropic' ||
                candidate.name
                  .toLowerCase()
                  .startsWith('claude')
              )
          )
          .sort((firstModel, secondModel) =>
            secondModel.name.localeCompare(
              firstModel.name,
              undefined,
              { numeric: true }
            )
          )

        const requestedModel =
          availableModels.find(
            (candidate) =>
              candidate.id === modelIdFromUrl
          )

        const defaultModel =
          requestedModel ??
          availableModels.find(
            (candidate) =>
              candidate.name.toLowerCase() ===
              'claude sonnet 5'
          ) ??
          availableModels.find((candidate) =>
            candidate.name
              .toLowerCase()
              .includes('sonnet')
          ) ??
          availableModels[0]

        const historyResponse = await fetch(
          HISTORY_API_URL,
          {
            method: 'GET',
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
          }
        )

        let historyResult: HistoryApiResponse

        try {
          historyResult =
            (await historyResponse.json()) as
              HistoryApiResponse
        } catch {
          throw new Error(
            'The history server returned an invalid response.'
          )
        }

        if (
          !historyResponse.ok ||
          !historyResult.success
        ) {
          throw new Error(
            historyResult.error ||
              'Could not load recent conversations.'
          )
        }

        const availableModelIds = new Set(
          availableModels.map(
            (candidate) => candidate.id
          )
        )

        if (cancelled) {
          return
        }

        setProfile(profileResult.data)
        setCreditsRemaining(
          profileResult.data.credits
        )
        setSubscriptionStatus(
          subscription.status
        )
        setModels(availableModels)
        setActiveModelId(defaultModel?.id ?? '')

        setConversations(
          (historyResult.conversations ?? [])
            .filter((conversation) =>
              availableModelIds.has(
                conversation.model_id
              )
            )
            .slice(0, 30)
        )

        if (!conversationFromUrl) {
          const pendingPrompt =
            sessionStorage
              .getItem('claude_pending_prompt')
              ?.trim()

          if (pendingPrompt) {
            sessionStorage.removeItem(
              'claude_pending_prompt'
            )

            pendingPromptRef.current =
              pendingPrompt
          }
        }
      } catch (err) {
        if (cancelled) {
          return
        }

        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load Claude.'
        )
      } finally {
        if (!cancelled) {
          setBootstrapLoading(false)
        }
      }
    }

    void bootstrapChat()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (bootstrapLoading) {
      return
    }

    const targetConversationId: string =
      conversationFromUrl

    if (!targetConversationId) {
      if (loadedConversationIdRef.current) {
        loadedConversationIdRef.current = null
        setConversationId(null)
        setConversationTitle(null)
        setMessages([])
        setLastCreditsUsed(null)
      }

      return
    }

    if (
      loadedConversationIdRef.current ===
      targetConversationId
    ) {
      return
    }

    let cancelled = false

    async function loadConversation() {
      try {
        setConversationLoading(true)
        setError(null)

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.access_token) {
          throw new Error(
            'Your login session has expired.'
          )
        }

        const response = await fetch(
          `${HISTORY_API_URL}?conversationId=${encodeURIComponent(
            targetConversationId
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
          }
        )

        let result: HistoryApiResponse

        try {
          result =
            (await response.json()) as
              HistoryApiResponse
        } catch {
          throw new Error(
            'The history server returned an invalid response.'
          )
        }

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ||
              'Could not load the conversation.'
          )
        }

        if (!result.conversation) {
          throw new Error(
            'The conversation was not found.'
          )
        }

        let restoredMessages: ChatMessage[] =
          (result.messages ?? [])
            .filter(
              (savedMessage) =>
                savedMessage.role === 'user' ||
                savedMessage.role === 'assistant'
            )
            .map((savedMessage) => ({
              id: savedMessage.id,
              role:
                savedMessage.role as
                  | 'user'
                  | 'assistant',
              content: savedMessage.content,
            }))

        try {
          const messageIds = restoredMessages.map(
            (savedMessage) => savedMessage.id
          )

          if (messageIds.length > 0) {
            const {
              data: attachmentRows,
              error: attachmentError,
            } = await supabase
              .from('chat_attachments')
              .select(
                'id, message_id, storage_path, file_name, mime_type, size_bytes'
              )
              .eq(
                'conversation_id',
                result.conversation.id
              )
              .eq('status', 'attached')
              .in('message_id', messageIds)

            if (attachmentError) {
              throw attachmentError
            }

            const storedAttachments =
              (attachmentRows ??
                []) as StoredAttachmentRow[]

            if (storedAttachments.length > 0) {
              const {
                data: signedRows,
                error: signedUrlError,
              } = await supabase.storage
                .from('chat-attachments')
                .createSignedUrls(
                  storedAttachments.map(
                    (attachment) =>
                      attachment.storage_path
                  ),
                  60 * 60
                )

              if (signedUrlError) {
                throw signedUrlError
              }

              const signedResults = (
                signedRows ?? []
              ) as Array<{
                signedUrl?: string
              }>

              const attachmentsByMessage =
                new Map<
                  string,
                  MessageAttachment[]
                >()

              storedAttachments.forEach(
                (attachment, index) => {
                  if (!attachment.message_id) {
                    return
                  }

                  const previewUrl =
                    signedResults[
                      index
                    ]?.signedUrl?.trim() ?? ''

                  const currentAttachments =
                    attachmentsByMessage.get(
                      attachment.message_id
                    ) ?? []

                  currentAttachments.push({
                    id: attachment.id,
                    fileName:
                      attachment.file_name,
                    mimeType:
                      attachment.mime_type,
                    sizeBytes:
                      attachment.size_bytes,
                    previewUrl,
                  })

                  attachmentsByMessage.set(
                    attachment.message_id,
                    currentAttachments
                  )
                }
              )

              restoredMessages =
                restoredMessages.map(
                  (savedMessage) => ({
                    ...savedMessage,
                    attachments:
                      attachmentsByMessage.get(
                        savedMessage.id
                      ),
                  })
                )
            }
          }
        } catch (attachmentLoadError) {
          console.error(
            'Could not load message attachments:',
            attachmentLoadError
          )
        }

        const storedModel = models.find(
          (candidate) =>
            candidate.id ===
            result.conversation?.model_id
        )

        if (cancelled) {
          return
        }

        loadedConversationIdRef.current =
          result.conversation.id

        setConversationId(
          result.conversation.id
        )

        setConversationTitle(
          result.conversation.title
        )

        setMessages(restoredMessages)

        if (storedModel) {
          setActiveModelId(storedModel.id)

          navigate(
            `/chat/${storedModel.id}?conversation=${result.conversation.id}`,
            { replace: true }
          )
        }
      } catch (err) {
        if (cancelled) {
          return
        }

        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the conversation.'
        )
      } finally {
        if (!cancelled) {
          setConversationLoading(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [
    bootstrapLoading,
    conversationFromUrl,
    models,
    navigate,
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, sending])

  useEffect(() => {
    const pendingPrompt =
      pendingPromptRef.current

    if (
      bootstrapLoading ||
      conversationLoading ||
      sending ||
      conversationFromUrl ||
      !activeModel ||
      !canSendMessages ||
      !pendingPrompt
    ) {
      return
    }

    pendingPromptRef.current = null
    void sendText(pendingPrompt)
  }, [
    bootstrapLoading,
    conversationLoading,
    sending,
    conversationFromUrl,
    activeModel,
    canSendMessages,
  ])

  async function refreshConversationList(
    accessToken: string
  ) {
    try {
      const response = await fetch(
        HISTORY_API_URL,
        {
          method: 'GET',
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        }
      )

      const result =
        (await response.json()) as
          HistoryApiResponse

      if (
        response.ok &&
        result.success &&
        result.conversations
      ) {
        const availableModelIds = new Set(
          models.map((candidate) => candidate.id)
        )

        setConversations(
          result.conversations
            .filter((conversation) =>
              availableModelIds.has(
                conversation.model_id
              )
            )
            .slice(0, 30)
        )
      }
    } catch (refreshError) {
      console.error(
        'Could not refresh conversation list:',
        refreshError
      )
    }
  }

  async function uploadAttachment(
    draft: PendingAttachment,
    file: File
  ) {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const formData = new FormData()
      formData.append('file', file)

      if (conversationId) {
        formData.append(
          'conversationId',
          conversationId
        )
      }

      const response = await fetch(
        UPLOAD_ATTACHMENT_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      )

      let result: AttachmentUploadResponse

      try {
        result =
          (await response.json()) as
            AttachmentUploadResponse
      } catch {
        throw new Error(
          'The upload server returned an invalid response.'
        )
      }

      if (
        !response.ok ||
        !result.success ||
        !result.attachment
      ) {
        throw new Error(
          result.error ||
            'The image could not be uploaded.'
        )
      }

      if (
        result.attachment.attachmentType !==
        'image'
      ) {
        throw new Error(
          'Only image attachments are enabled in this step.'
        )
      }

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.map(
            (attachment) =>
              attachment.localId ===
              draft.localId
                ? {
                    ...attachment,
                    id:
                      result.attachment!.id,
                    fileName:
                      result.attachment!
                        .fileName,
                    mimeType:
                      result.attachment!
                        .mimeType,
                    sizeBytes:
                      result.attachment!
                        .sizeBytes,
                    status: 'ready',
                    error: undefined,
                  }
                : attachment
          )
      )
    } catch (uploadError) {
      const uploadMessage =
        uploadError instanceof Error
          ? uploadError.message
          : 'The image could not be uploaded.'

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.map(
            (attachment) =>
              attachment.localId ===
              draft.localId
                ? {
                    ...attachment,
                    status: 'error',
                    error: uploadMessage,
                  }
                : attachment
          )
      )

      setError(uploadMessage)
    }
  }

  function handleAttachmentSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFiles = Array.from(
      event.target.files ?? []
    )

    event.target.value = ''

    if (selectedFiles.length === 0) {
      return
    }

    const availableSlots =
      MAX_ATTACHMENTS_PER_MESSAGE -
      pendingAttachments.length

    if (availableSlots <= 0) {
      setError(
        `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} images to one message.`
      )
      return
    }

    const acceptedFiles =
      selectedFiles.slice(0, availableSlots)

    if (
      selectedFiles.length >
      availableSlots
    ) {
      setError(
        `Only ${availableSlots} more ${
          availableSlots === 1
            ? 'image'
            : 'images'
        } can be attached.`
      )
    } else {
      setError(null)
    }

    for (const file of acceptedFiles) {
      const mimeType =
        file.type.trim().toLowerCase()

      if (
        !supportedImageMimeTypes.has(
          mimeType
        )
      ) {
        setError(
          `"${file.name}" is not a supported image. Use PNG, JPEG, WebP, or GIF.`
        )
        continue
      }

      if (
        file.size <= 0 ||
        file.size >
          MAX_ATTACHMENT_SIZE_BYTES
      ) {
        setError(
          `"${file.name}" must be smaller than 6 MB.`
        )
        continue
      }

      const previewUrl =
        URL.createObjectURL(file)

      objectPreviewUrlsRef.current.add(
        previewUrl
      )

      const draft: PendingAttachment = {
        id: '',
        localId: crypto.randomUUID(),
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        previewUrl,
        status: 'uploading',
      }

      setPendingAttachments(
        (currentAttachments) => [
          ...currentAttachments,
          draft,
        ]
      )

      void uploadAttachment(draft, file)
    }
  }

  async function removePendingAttachment(
    attachment: PendingAttachment
  ) {
    if (attachment.status === 'uploading') {
      setError(
        'Wait for the image upload to finish before removing it.'
      )
      return
    }

    try {
      if (
        attachment.status === 'ready' &&
        attachment.id
      ) {
        const {
          data: storedAttachment,
          error: lookupError,
        } = await supabase
          .from('chat_attachments')
          .select('storage_path')
          .eq('id', attachment.id)
          .single()

        if (lookupError) {
          throw lookupError
        }

        const storagePath =
          storedAttachment?.storage_path

        if (
          typeof storagePath !== 'string' ||
          !storagePath.trim()
        ) {
          throw new Error(
            'The stored image path is invalid.'
          )
        }

        const {
          error: storageDeleteError,
        } = await supabase.storage
          .from('chat-attachments')
          .remove([storagePath])

        if (storageDeleteError) {
          throw storageDeleteError
        }

        const {
          error: databaseDeleteError,
        } = await supabase
          .from('chat_attachments')
          .delete()
          .eq('id', attachment.id)

        if (databaseDeleteError) {
          throw databaseDeleteError
        }
      }

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.filter(
            (candidate) =>
              candidate.localId !==
              attachment.localId
          )
      )

      URL.revokeObjectURL(
        attachment.previewUrl
      )

      objectPreviewUrlsRef.current.delete(
        attachment.previewUrl
      )

      setError(null)
    } catch (removeError) {
      console.error(removeError)

      setError(
        removeError instanceof Error
          ? removeError.message
          : 'The image could not be removed.'
      )
    }
  }

  function discardPendingAttachments() {
    const attachmentsToDiscard = [
      ...pendingAttachments,
    ]

    setPendingAttachments([])

    for (const attachment of attachmentsToDiscard) {
      if (attachment.status === 'ready') {
        void removePendingAttachment(attachment)
      } else {
        URL.revokeObjectURL(
          attachment.previewUrl
        )

        objectPreviewUrlsRef.current.delete(
          attachment.previewUrl
        )
      }
    }
  }

  async function sendText(
    cleanedMessage: string
  ) {
    const selectedAttachments =
      pendingAttachments.filter(
        (attachment) =>
          attachment.status === 'ready' &&
          attachment.id
      )

    const effectiveMessage =
      cleanedMessage ||
      (
        selectedAttachments.length === 1
          ? 'Please analyze this image.'
          : selectedAttachments.length > 1
            ? 'Please analyze these images.'
            : ''
      )

    if (
      !effectiveMessage ||
      !activeModel ||
      sending
    ) {
      return
    }

    if (attachmentUploadInProgress) {
      setError(
        'Wait for all image uploads to finish before sending.'
      )
      return
    }

    if (!canSendMessages) {
      setError(
        accessMessage ||
          'Chat access is currently unavailable.'
      )
      return
    }

    /*
     * Capture the selected model before the asynchronous request
     * begins. The model selector is disabled while streaming, but
     * this stable reference also keeps TypeScript and navigation
     * behavior deterministic.
     */
    const selectedModel = activeModel
    const assistantMessageId = crypto.randomUUID()

    let assistantStarted = false

    setError(null)
    setSending(true)
    setStreamingMessageId(null)
    setMessage('')

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: effectiveMessage,
      attachments:
        selectedAttachments.length > 0
          ? selectedAttachments.map(
              (attachment) => ({
                id: attachment.id,
                fileName:
                  attachment.fileName,
                mimeType:
                  attachment.mimeType,
                sizeBytes:
                  attachment.sizeBytes,
                previewUrl:
                  attachment.previewUrl,
              })
            )
          : undefined,
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ])

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const response = await fetch(
        CHAT_STREAM_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            Accept:
              'application/x-ndjson, application/json',
          },
          body: JSON.stringify({
            modelId: selectedModel.id,
            message: effectiveMessage,
            conversationId,
            attachmentIds:
              selectedAttachments.map(
                (attachment) => attachment.id
              ),
          }),
        }
      )

      if (!response.ok) {
        const responseText =
          await response.text()

        let responseError =
          'The Claude request failed.'

        try {
          const result =
            JSON.parse(
              responseText
            ) as ChatErrorResponse

          if (result.error?.trim()) {
            responseError = result.error.trim()
          }
        } catch {
          if (responseText.trim()) {
            responseError = responseText.trim()
          }
        }

        throw new Error(responseError)
      }

      if (!response.body) {
        throw new Error(
          'The server did not return a response stream.'
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let buffer = ''

      const streamResult: {
        completion:
          | ChatStreamCompleteEvent
          | null
      } = {
        completion: null,
      }

      function applyStreamEvent(
        event: ChatStreamEvent
      ) {
        if (event.type === 'delta') {
          if (!event.delta) {
            return
          }

          if (!assistantStarted) {
            assistantStarted = true

            setStreamingMessageId(
              assistantMessageId
            )

            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: event.delta,
              },
            ])

            return
          }

          setMessages((currentMessages) =>
            currentMessages.map(
              (chatMessage) =>
                chatMessage.id ===
                assistantMessageId
                  ? {
                      ...chatMessage,
                      content:
                        chatMessage.content +
                        event.delta,
                    }
                  : chatMessage
            )
          )

          return
        }

        if (event.type === 'complete') {
          streamResult.completion = event
          return
        }

        if (event.type === 'error') {
          throw new Error(
            event.error ||
              'Claude could not complete the response.'
          )
        }
      }

      function processLine(rawLine: string) {
        const line = rawLine.trim()

        if (!line) {
          return
        }

        let event: ChatStreamEvent

        try {
          event =
            JSON.parse(line) as ChatStreamEvent
        } catch {
          throw new Error(
            'The server returned an invalid streaming event.'
          )
        }

        applyStreamEvent(event)
      }

      try {
        while (true) {
          const { value, done } =
            await reader.read()

          if (done) {
            buffer += decoder.decode()
            break
          }

          buffer += decoder.decode(value, {
            stream: true,
          })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            processLine(line)
          }
        }

        if (buffer.trim()) {
          processLine(buffer)
        }
      } finally {
        reader.releaseLock()
      }

      const completion =
        streamResult.completion

      if (!completion) {
        throw new Error(
          'The response stream ended before completion.'
        )
      }

      if (!assistantStarted) {
        throw new Error(
          'Claude returned an empty response.'
        )
      }

      const returnedConversationId =
        completion.conversationId?.trim()

      if (!returnedConversationId) {
        throw new Error(
          'The server did not return a valid conversation ID.'
        )
      }

      loadedConversationIdRef.current =
        returnedConversationId

      setConversationId(returnedConversationId)

      if (!conversationTitle) {
        setConversationTitle(
          effectiveMessage.slice(0, 100)
        )
      }

      setCreditsRemaining(
        completion.creditsRemaining
      )

      if (completion.creditsRemaining <= 0) {
        setSubscriptionStatus('inactive')
      }

      setLastCreditsUsed(
        completion.creditsUsed
      )

      setStreamingMessageId(null)
      setPendingAttachments([])

      navigate(
        `/chat/${selectedModel.id}?conversation=${returnedConversationId}`,
        { replace: true }
      )

      await refreshConversationList(
        session.access_token
      )
    } catch (err) {
      console.error(err)

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Could not send the message.'

      setError(errorMessage)

      /*
       * Keep partial streamed text visible. When generation never
       * started, remove the optimistic user message so the same
       * uploaded images can be retried from the composer.
       */
      if (!assistantStarted) {
        setMessages((currentMessages) =>
          currentMessages.filter(
            (chatMessage) =>
              chatMessage.id !== userMessage.id
          )
        )

        setMessage(cleanedMessage)
      }
    } finally {
      setStreamingMessageId(null)
      setSending(false)
    }
  }


  function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    void sendText(message.trim())
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault()
      sendMessage()
    }
  }

  function startNewChat(
    selectedModelId = activeModel?.id
  ) {
    if (!selectedModelId) {
      return
    }

    if (attachmentUploadInProgress) {
      setError(
        'Wait for the image upload to finish before starting a new chat.'
      )
      return
    }

    discardPendingAttachments()

    pendingPromptRef.current = null
    loadedConversationIdRef.current = null

    sessionStorage.removeItem(
      'claude_pending_prompt'
    )

    setMessages([])
    setMessage('')
    setConversationId(null)
    setConversationTitle(null)
    setError(null)
    setLastCreditsUsed(null)
    setSidebarOpen(false)
    setActiveModelId(selectedModelId)

    navigate(`/chat/${selectedModelId}`)
  }

  function changeModel(nextModelId: string) {
    const nextModel = models.find(
      (candidate) =>
        candidate.id === nextModelId
    )

    if (!nextModel || nextModel.id === activeModelId) {
      return
    }

    setActiveModelId(nextModel.id)

    const conversationQuery = conversationId
      ? `?conversation=${conversationId}`
      : ''

    navigate(
      `/chat/${nextModel.id}${conversationQuery}`,
      { replace: true }
    )
  }

  function openConversation(
    conversation: HistoryConversation
  ) {
    if (attachmentUploadInProgress) {
      setError(
        'Wait for the image upload to finish before opening another conversation.'
      )
      return
    }

    discardPendingAttachments()
    loadedConversationIdRef.current = null
    setSidebarOpen(false)

    navigate(
      `/chat/${conversation.model_id}?conversation=${conversation.id}`
    )
  }

  async function copyMessage(
    chatMessage: ChatMessage
  ) {
    try {
      await navigator.clipboard.writeText(
        chatMessage.content
      )

      setCopiedMessageId(chatMessage.id)

      window.setTimeout(() => {
        setCopiedMessageId((currentId) =>
          currentId === chatMessage.id
            ? null
            : currentId
        )
      }, 1500)
    } catch {
      setError(
        'Could not copy the response.'
      )
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  const selectedModelName =
    activeModel?.name.replace(
      /^Claude\s+/i,
      ''
    ) || 'Claude'

  const pageTitle =
    conversationTitle?.trim() ||
    (messages.length > 0
      ? 'Claude conversation'
      : 'New chat')

  const sidebar = (
    <div className="flex h-full flex-col bg-[#20201e] px-3 py-3">
      <div className="flex items-center justify-between px-1 py-1">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="text-[24px] leading-none text-[#f1eee8]"
          style={{
            fontFamily:
              'Georgia, Cambria, Times New Roman, serif',
          }}
        >
          Claude
        </button>

        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-2 text-[#d5cfc6] hover:bg-[#2b2b29] lg:hidden"
          aria-label="Close sidebar"
        >
          <Icon name="close" />
        </button>
      </div>

      <nav className="mt-4 space-y-1">
        <SidebarItem
          label="New chat"
          icon={<Icon name="plus" />}
          onClick={() => startNewChat()}
        />

        <SidebarItem
          label="Chats"
          icon={<Icon name="chat" />}
          active
        />

        <SidebarItem
          label="Projects"
          icon={<Icon name="folder" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Artifacts"
          icon={<Icon name="artifact" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Code"
          icon={<Icon name="code" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Customize"
          icon={<Icon name="sliders" />}
          disabled
          badge="Next"
        />
      </nav>

      <div className="mt-5 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#827d75]">
        Products
      </div>

      <div className="mt-1">
        <SidebarItem
          label="Design"
          icon={<Icon name="palette" />}
          disabled
          badge="Next"
        />
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#827d75]">
            Recents
          </p>

          <span className="text-[11px] text-[#777169]">
            {conversations.length}
          </span>
        </div>

        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {bootstrapLoading && (
            <div className="space-y-2 px-3 py-2">
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#2f2f2c]" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-[#2b2b29]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#2b2b29]" />
            </div>
          )}

          {!bootstrapLoading &&
            conversations.length === 0 && (
              <p className="px-3 py-3 text-xs leading-5 text-[#827d75]">
                Your conversations will appear here.
              </p>
            )}

          {!bootstrapLoading &&
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() =>
                  openConversation(conversation)
                }
                className={[
                  'w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#2b2b29]',
                  conversation.id === conversationId
                    ? 'bg-[#2b2b29]'
                    : '',
                ].join(' ')}
              >
                <p className="truncate text-sm text-[#ddd7ce]">
                  {conversation.title ||
                    'Untitled conversation'}
                </p>

                <p className="mt-1 text-[10px] text-[#817b73]">
                  {formatConversationDate(
                    conversation.created_at
                  )}
                </p>
              </button>
            ))}
        </div>
      </div>

      <div className="mt-3 border-t border-[#33322f] pt-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5ded3] text-xs font-semibold text-[#2a2926]">
            {profile
              ? getInitials(profile.full_name)
              : 'U'}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#eee9e1]">
              {profile?.full_name || 'Loading...'}
            </p>

            <p className="truncate text-[11px] text-[#8f8981]">
              {(creditsRemaining ?? 0).toLocaleString()}{' '}
              credits
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg p-2 text-[#8f8981] transition hover:bg-[#2b2b29] hover:text-[#eee9e1] disabled:opacity-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon
              name="logout"
              className="h-4 w-4"
            />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#1f1f1d] text-[#eee9e1]">
      <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="hidden min-h-screen border-r border-[#33322f] lg:block">
          <div className="fixed inset-y-0 w-[288px]">
            {sidebar}
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            />

            <aside className="relative h-full w-[288px] border-r border-[#33322f]">
              {sidebar}
            </aside>
          </div>
        )}

        <main className="relative flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-[#30302d] bg-[#1f1f1d]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg p-2 text-[#cfc8bf] hover:bg-[#2b2b29] lg:hidden"
                  aria-label="Open sidebar"
                >
                  <Icon name="menu" />
                </button>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#e9e4dc]">
                    {pageTitle}
                  </p>

                  <p className="truncate text-[11px] text-[#7f7971]">
                    Claude {selectedModelName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[#8e877f] sm:inline">
                  {(creditsRemaining ?? 0).toLocaleString()}{' '}
                  credits
                </span>

                <button
                  type="button"
                  onClick={() => startNewChat()}
                  disabled={
                    bootstrapLoading ||
                    !activeModel
                  }
                  className="rounded-lg border border-[#3b3a37] bg-[#292927] px-3 py-2 text-xs font-medium text-[#e9e4dc] transition hover:bg-[#333330] disabled:opacity-45"
                >
                  New chat
                </button>
              </div>
            </div>
          </header>

          <section className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-5 pb-48 pt-10 sm:px-8">
              {bootstrapLoading && (
                <div className="space-y-8 py-8">
                  <div className="flex justify-end">
                    <div className="h-16 w-2/3 animate-pulse rounded-[20px] bg-[#292927]" />
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-[#302c28]" />

                    <div className="flex-1 space-y-3">
                      <div className="h-3 w-full animate-pulse rounded bg-[#292927]" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-[#292927]" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-[#292927]" />
                    </div>
                  </div>
                </div>
              )}

              {!bootstrapLoading &&
                conversationLoading && (
                  <div className="space-y-8 py-8">
                    <div className="flex justify-end">
                      <div className="h-14 w-1/2 animate-pulse rounded-[20px] bg-[#292927]" />
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="h-7 w-7 animate-pulse rounded-full bg-[#302c28]" />

                      <div className="flex-1 space-y-3">
                        <div className="h-3 w-full animate-pulse rounded bg-[#292927]" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#292927]" />
                      </div>
                    </div>
                  </div>
                )}

              {!bootstrapLoading &&
                !conversationLoading &&
                messages.length === 0 &&
                !sending && (
                  <div className="flex min-h-[54vh] flex-col items-center justify-center text-center">
                    <div className="text-[#df6b45]">
                      <Icon
                        name="spark"
                        className="h-10 w-10"
                      />
                    </div>

                    <h1
                      className="mt-5 text-4xl text-[#e5ded3]"
                      style={{
                        fontFamily:
                          'Georgia, Cambria, Times New Roman, serif',
                      }}
                    >
                      Start a conversation
                    </h1>

                    <p className="mt-3 max-w-md text-sm leading-6 text-[#8c857d]">
                      Ask Claude to write, analyze,
                      explain, plan, or help with code.
                    </p>
                  </div>
                )}

              {!bootstrapLoading &&
                !conversationLoading && (
                  <div className="space-y-9">
                    {messages.map((chatMessage) => (
                      <article
                        key={chatMessage.id}
                        className={
                          chatMessage.role === 'user'
                            ? 'flex justify-end'
                            : 'flex items-start gap-3'
                        }
                      >
                        {chatMessage.role ===
                          'assistant' && (
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-[#df6b45]">
                            <Icon
                              name="spark"
                              className="h-6 w-6"
                            />
                          </div>
                        )}

                        <div
                          className={
                            chatMessage.role === 'user'
                              ? 'max-w-[86%] rounded-[20px] bg-[#2c2c29] px-5 py-3.5 text-[#eee9e1]'
                              : 'min-w-0 flex-1'
                          }
                        >
                          {chatMessage.attachments &&
                            chatMessage.attachments
                              .length > 0 && (
                              <div className="mb-3 grid max-w-[520px] grid-cols-2 gap-2">
                                {chatMessage.attachments.map(
                                  (attachment) => (
                                    <div
                                      key={
                                        attachment.id
                                      }
                                      className="overflow-hidden rounded-xl border border-[#44423e] bg-[#242422]"
                                    >
                                      {attachment.previewUrl ? (
                                        <img
                                          src={
                                            attachment.previewUrl
                                          }
                                          alt={
                                            attachment.fileName
                                          }
                                          className="h-36 w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-36 items-center justify-center px-3 text-center text-xs text-[#8f8981]">
                                          {
                                            attachment.fileName
                                          }
                                        </div>
                                      )}

                                      <div className="truncate px-3 py-2 text-[11px] text-[#aaa49c]">
                                        {
                                          attachment.fileName
                                        }
                                      </div>
                                    </div>
                                  )
                                )}
                              </div>
                            )}

                          <div
                            className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e1d8]"
                            aria-live={
                              chatMessage.id ===
                              streamingMessageId
                                ? 'polite'
                                : undefined
                            }
                          >
                            {chatMessage.content}

                            {chatMessage.id ===
                              streamingMessageId && (
                              <span
                                className="ml-0.5 inline-block animate-pulse text-[#df6b45]"
                                aria-hidden="true"
                              >
                                ▍
                              </span>
                            )}
                          </div>

                          {chatMessage.role ===
                            'assistant' &&
                            chatMessage.id !==
                              streamingMessageId && (
                            <div className="mt-3 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void copyMessage(
                                    chatMessage
                                  )
                                }
                                className="rounded-lg p-2 text-[#807a72] transition hover:bg-[#2b2b29] hover:text-[#cfc8bf]"
                                title="Copy response"
                                aria-label="Copy response"
                              >
                                <Icon
                                  name={
                                    copiedMessageId ===
                                    chatMessage.id
                                      ? 'check'
                                      : 'copy'
                                  }
                                  className="h-4 w-4"
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}

                    {sending &&
                      streamingMessageId === null && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-[#df6b45]">
                          <Icon
                            name="spark"
                            className="h-6 w-6"
                          />
                        </div>

                        <div className="pt-1 text-sm text-[#8f8981]">
                          Claude {selectedModelName} is
                          thinking
                          <span className="animate-pulse">
                            ...
                          </span>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
            </div>
          </section>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#1f1f1d] via-[#1f1f1d] to-transparent pb-4 pt-14 lg:left-[288px]">
            <div className="pointer-events-auto mx-auto w-full max-w-[780px] px-4 sm:px-6">
              {error && (
                <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/35 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {accessMessage && (
                <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-200">
                  {accessMessage}
                </div>
              )}

              <form
                onSubmit={sendMessage}
                className="rounded-[22px] border border-[#3a3936] bg-[#2a2a28] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.32)]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={
                    handleAttachmentSelection
                  }
                />

                {pendingAttachments.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
                    {pendingAttachments.map(
                      (attachment) => (
                        <div
                          key={attachment.localId}
                          className="relative overflow-hidden rounded-xl border border-[#44423e] bg-[#232321]"
                        >
                          <img
                            src={attachment.previewUrl}
                            alt={attachment.fileName}
                            className="h-24 w-full object-cover"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              void removePendingAttachment(
                                attachment
                              )
                            }
                            disabled={
                              attachment.status ===
                              'uploading'
                            }
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-50"
                            aria-label={`Remove ${attachment.fileName}`}
                            title={`Remove ${attachment.fileName}`}
                          >
                            ×
                          </button>

                          <div className="px-2 py-2">
                            <p className="truncate text-[11px] text-[#d9d3ca]">
                              {attachment.fileName}
                            </p>

                            <p
                              className={[
                                'mt-1 truncate text-[10px]',
                                attachment.status ===
                                'error'
                                  ? 'text-red-300'
                                  : 'text-[#817b73]',
                              ].join(' ')}
                              title={
                                attachment.error
                              }
                            >
                              {attachment.status ===
                              'uploading'
                                ? 'Uploading...'
                                : attachment.status ===
                                    'error'
                                  ? attachment.error ||
                                    'Upload failed'
                                  : formatFileSize(
                                      attachment.sizeBytes
                                    )}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value)
                  }
                  onKeyDown={handleKeyDown}
                  placeholder={
                    pendingAttachments.length > 0
                      ? 'Ask Claude about the attached images...'
                      : `Message Claude ${selectedModelName}...`
                  }
                  rows={2}
                  maxLength={10000}
                  disabled={
                    sending ||
                    bootstrapLoading ||
                    conversationLoading ||
                    !canSendMessages
                  }
                  className="max-h-48 min-h-[54px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-[#eee9e1] outline-none placeholder:text-[#8b857d] disabled:cursor-not-allowed disabled:opacity-60"
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    disabled={
                      sending ||
                      bootstrapLoading ||
                      conversationLoading ||
                      !canSendMessages ||
                      pendingAttachments.length >=
                        MAX_ATTACHMENTS_PER_MESSAGE
                    }
                    title="Attach images"
                    className="rounded-lg p-2 text-[#d8d2c9] transition hover:bg-[#363633] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Attach images"
                  >
                    <Icon name="plus" />
                  </button>

                  <div className="flex min-w-0 items-center gap-1">
                    <select
                      value={activeModelId}
                      onChange={(event) =>
                        changeModel(
                          event.target.value
                        )
                      }
                      disabled={
                        sending ||
                        bootstrapLoading ||
                        models.length === 0
                      }
                      className="max-w-[190px] cursor-pointer appearance-none bg-transparent px-2 py-2 text-right text-sm font-semibold text-[#eee9e1] outline-none disabled:opacity-50"
                      aria-label="Claude model"
                    >
                      {models.map(
                        (candidate) => (
                          <option
                            key={candidate.id}
                            value={candidate.id}
                            className="bg-[#2a2a28] text-[#eee9e1]"
                          >
                            {candidate.name.replace(
                              /^Claude\s+/i,
                              ''
                            )}
                          </option>
                        )
                      )}
                    </select>

                    <button
                      type="button"
                      disabled
                      title="Reasoning controls are coming next"
                      className="rounded-lg px-2 py-2 text-xs text-[#9b958d]"
                    >
                      Medium⌄
                    </button>

                    <button
                      type="button"
                      disabled
                      title="Voice input is coming later"
                      className="rounded-lg p-2 text-[#aaa49c] opacity-50"
                    >
                      <Icon name="mic" />
                    </button>

                    {message.trim() ||
                    readyAttachments.length > 0 ? (
                      <button
                        type="submit"
                        disabled={
                          !canSubmitMessage
                        }
                        className="rounded-full bg-[#eee9e1] p-2 text-[#272624] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        <Icon
                          name="send"
                          className="h-4 w-4"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Voice conversation is coming later"
                        className="rounded-lg p-2 text-[#aaa49c] opacity-50"
                      >
                        <Icon name="wave" />
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-[#66615b]">
                <span>
                  Claude can make mistakes. Review
                  important information.
                </span>

                {lastCreditsUsed !== null && (
                  <>
                    <span>·</span>
                    <span>
                      Last response used{' '}
                      {lastCreditsUsed}{' '}
                      {lastCreditsUsed === 1
                        ? 'credit'
                        : 'credits'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Chat