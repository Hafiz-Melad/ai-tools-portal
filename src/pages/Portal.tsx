import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Profile = {
  full_name: string | null
  credits: number
}

type Plan = {
  id: string
  name: string
  price: number
}

type Subscription = {
  plan_id: string
  status: string
  plans: Plan
}

type AIModel = {
  id: string
  name: string
  provider: string
  description: string
  enabled: boolean
}

type ReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'

type HistoryModel = {
  id: string
  name: string
  provider: string
}

type Conversation = {
  id: string
  title: string | null
  model_id: string
  created_at: string
  ai_models: HistoryModel | HistoryModel[] | null
}

type HistoryApiResponse = {
  success: boolean
  conversations?: Conversation[]
  deletedConversationId?: string
  error?: string
}

type SidebarItemProps = {
  label: string
  icon: ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  badge?: string
}

const HISTORY_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/history'
  : '/api/history'

const REASONING_EFFORT_STORAGE_KEY =
  'claude_reasoning_effort'

const PROMPT_PRESETS = [
  {
    label: 'Write',
    prompt: 'Help me write ',
  },
  {
    label: 'Learn',
    prompt: 'Teach me about ',
  },
  {
    label: 'Code',
    prompt: 'Help me build ',
  },
  {
    label: 'Life stuff',
    prompt: 'Help me think through ',
  },
  {
    label: "Claude's choice",
    prompt: 'Suggest something useful we can work on together.',
  },
]

function normalizeReasoningEffort(
  value: unknown
): ReasoningEffort {
  if (typeof value !== 'string') {
    return 'medium'
  }

  const normalized = value
    .trim()
    .toLowerCase()

  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high'
  ) {
    return normalized
  }

  return 'medium'
}

function getStoredReasoningEffort(): ReasoningEffort {
  try {
    return normalizeReasoningEffort(
      window.localStorage.getItem(
        REASONING_EFFORT_STORAGE_KEY
      )
    )
  } catch {
    return 'medium'
  }
}

function storeReasoningEffort(
  reasoningEffort: ReasoningEffort
): void {
  try {
    window.localStorage.setItem(
      REASONING_EFFORT_STORAGE_KEY,
      reasoningEffort
    )
  } catch {
    // The selection still works for this browser session.
  }
}

function normalizeModelRelation(
  value: unknown
): AIModel | null {
  if (Array.isArray(value)) {
    return (value[0] as AIModel | undefined) ?? null
  }

  return (value as AIModel | null) ?? null
}

function getConversationModel(
  conversation: Conversation
): HistoryModel | null {
  if (Array.isArray(conversation.ai_models)) {
    return conversation.ai_models[0] ?? null
  }

  return conversation.ai_models
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

function getFirstName(
  fullName: string | null | undefined
): string {
  const cleanedName = fullName?.trim()

  if (!cleanedName) {
    return 'there'
  }

  return cleanedName.split(/\s+/)[0] || 'there'
}

function getInitials(
  fullName: string | null | undefined
): string {
  const cleanedName = fullName?.trim()

  if (!cleanedName) {
    return 'U'
  }

  const parts = cleanedName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return (
    parts
      .map((part) =>
        part.charAt(0).toUpperCase()
      )
      .join('') || 'U'
  )
}

function getModelFamily(modelName: string): string {
  const normalizedName = modelName.toLowerCase()

  if (normalizedName.includes('haiku')) {
    return 'Haiku'
  }

  if (normalizedName.includes('sonnet')) {
    return 'Sonnet'
  }

  if (normalizedName.includes('opus')) {
    return 'Opus'
  }

  return 'Claude'
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
    | 'search'
    | 'spark'
    | 'paperclip'
    | 'mic'
    | 'wave'
    | 'send'
    | 'credit'
    | 'logout'
    | 'trash'
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
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.2" {...common} />
        <path d="m15.5 15.5 4.2 4.2" {...common} />
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
    paperclip: (
      <path
        d="m8.1 12.8 6.2-6.2a3.1 3.1 0 1 1 4.4 4.4l-7.5 7.5a4.5 4.5 0 0 1-6.4-6.4l7-7"
        {...common}
      />
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
    send: (
      <>
        <path d="m5 12 14-7-4.2 14-3-5-6.8-2Z" {...common} />
        <path d="m11.8 14 3.5-3.5" {...common} />
      </>
    ),
    credit: (
      <>
        <circle cx="12" cy="12" r="8.5" {...common} />
        <path
          d="M9.5 9.4h3.7a1.8 1.8 0 0 1 0 3.6h-2.4a1.8 1.8 0 0 0 0 3.6h3.7M12 7.3v9.4"
          {...common}
        />
      </>
    ),
    logout: (
      <>
        <path d="M10 5H5.5v14H10" {...common} />
        <path d="M13 8.5 16.5 12 13 15.5" {...common} />
        <path d="M8 12h8.5" {...common} />
      </>
    ),
    trash: (
      <>
        <path d="M4.5 7h15" {...common} />
        <path d="M9 7V4.8h6V7" {...common} />
        <path d="m7 7 .8 13h8.4L17 7" {...common} />
        <path d="M10 10.5v6" {...common} />
        <path d="M14 10.5v6" {...common} />
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

function Portal() {
  const navigate = useNavigate()

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [subscription, setSubscription] =
    useState<Subscription | null>(null)

  const [models, setModels] =
    useState<AIModel[]>([])

  const [selectedModelId, setSelectedModelId] =
    useState('')

  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(
      getStoredReasoningEffort
    )

  const [draft, setDraft] = useState('')

  const [conversations, setConversations] =
    useState<Conversation[]>([])

  const [loadingConversations, setLoadingConversations] =
    useState(true)

  const [conversationError, setConversationError] =
    useState<string | null>(null)

  const [
    deletingConversationId,
    setDeletingConversationId,
  ] = useState<string | null>(null)

  const [error, setError] =
    useState<string | null>(null)

  const [signingOut, setSigningOut] =
    useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.user) {
          throw new Error('No user found')
        }

        const user = session.user

        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('full_name, credits')
          .eq('id', user.id)
          .single()

        if (profileError) {
          throw profileError
        }

        setProfile(profileData)

        const {
          data: subscriptionData,
          error: subscriptionError,
        } = await supabase
          .from('subscriptions')
          .select(`
            plan_id,
            status,
            plans (
              id,
              name,
              price
            )
          `)
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (subscriptionError) {
          throw subscriptionError
        }

        if (!subscriptionData) {
          throw new Error(
            'No subscription was found.'
          )
        }

        const typedSubscription =
          subscriptionData as unknown as Subscription

        setSubscription(typedSubscription)

        const {
          data: modelData,
          error: modelError,
        } = await supabase
          .from('plan_models')
          .select(`
            ai_models (
              id,
              name,
              provider,
              description,
              enabled
            )
          `)
          .eq('plan_id', subscriptionData.plan_id)

        if (modelError) {
          throw modelError
        }

        const availableModels = (modelData ?? [])
          .map((item: { ai_models?: unknown }) =>
            normalizeModelRelation(item.ai_models)
          )
          .filter(
            (model): model is AIModel =>
              model !== null &&
              model.enabled === true &&
              (
                model.provider.toLowerCase() ===
                  'anthropic' ||
                model.name
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

        setModels(availableModels)

        const preferredModel =
          availableModels.find(
            (model) =>
              model.name.toLowerCase() ===
              'claude sonnet 5'
          ) ??
          availableModels.find((model) =>
            model.name
              .toLowerCase()
              .includes('sonnet')
          ) ??
          availableModels[0]

        setSelectedModelId(
          preferredModel?.id ?? ''
        )

        try {
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
            availableModels.map((model) => model.id)
          )

          setConversations(
            (historyResult.conversations ?? [])
              .filter((conversation) =>
                availableModelIds.has(
                  conversation.model_id
                )
              )
              .slice(0, 30)
          )
        } catch (historyError) {
          console.error(historyError)

          setConversationError(
            historyError instanceof Error
              ? historyError.message
              : 'Could not load recent conversations.'
          )
        } finally {
          setLoadingConversations(false)
        }
      } catch (err) {
        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load Claude.'
        )

        setLoadingConversations(false)
      }
    }

    void loadData()
  }, [])

  const selectedModel = useMemo(
    () =>
      models.find(
        (model) => model.id === selectedModelId
      ) ?? null,
    [models, selectedModelId]
  )

  const canStartChat =
    subscription?.status === 'active' &&
    (profile?.credits ?? 0) > 0 &&
    selectedModel !== null

  function openNewChat(initialPrompt?: string) {
    if (!canStartChat || !selectedModel) {
      return
    }

    const cleanedPrompt =
      initialPrompt?.trim() || draft.trim()

    if (cleanedPrompt) {
      sessionStorage.setItem(
        'claude_pending_prompt',
        cleanedPrompt
      )
    } else {
      sessionStorage.removeItem(
        'claude_pending_prompt'
      )
    }

    navigate(`/chat/${selectedModel.id}`)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    openNewChat()
  }

  async function handleDeleteConversation(
    conversation: Conversation
  ) {
    if (deletingConversationId) {
      return
    }

    const conversationTitle =
      conversation.title?.trim() ||
      'Untitled conversation'

    const confirmed = window.confirm(
      `Delete "${conversationTitle}"?\n\nThis permanently removes the conversation, its messages, and its attachments.`
    )

    if (!confirmed) {
      return
    }

    try {
      setConversationError(null)
      setDeletingConversationId(conversation.id)

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

      const deleteResponse = await fetch(
        HISTORY_API_URL,
        {
          method: 'DELETE',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: conversation.id,
          }),
        }
      )

      let deleteResult: HistoryApiResponse

      try {
        deleteResult =
          (await deleteResponse.json()) as
            HistoryApiResponse
      } catch {
        throw new Error(
          'The history server returned an invalid response.'
        )
      }

      if (
        !deleteResponse.ok ||
        !deleteResult.success
      ) {
        throw new Error(
          deleteResult.error ||
            'Could not delete the conversation.'
        )
      }

      setConversations((currentConversations) =>
        currentConversations.filter(
          (currentConversation) =>
            currentConversation.id !== conversation.id
        )
      )
    } catch (deleteError) {
      console.error(deleteError)

      setConversationError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete the conversation.'
      )
    } finally {
      setDeletingConversationId(null)
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

  if (error) {
    return (
      <div className="min-h-screen bg-[#1f1f1d] text-[#f0ece4] flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-2xl border border-red-900/60 bg-red-950/30 p-6">
          <h1 className="text-xl font-semibold">
            Claude unavailable
          </h1>

          <p className="mt-3 text-sm leading-6 text-red-200">
            {error}
          </p>

          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-xl bg-[#f0ece4] px-5 py-3 text-sm font-semibold text-[#1f1f1d]"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!profile || !subscription) {
    return (
      <div className="min-h-screen bg-[#1f1f1d] text-[#d8d2c9] flex items-center justify-center">
        Loading Claude...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1f1f1d] text-[#f0ece4]">
      <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="border-b border-[#33322f] bg-[#20201e] lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex h-full min-h-screen flex-col px-3 py-3 lg:fixed lg:inset-y-0 lg:w-[288px]">
            <div className="flex items-center justify-between px-1 py-1">
              <h1
                className="text-[24px] leading-none text-[#f1eee8]"
                style={{
                  fontFamily:
                    'Georgia, Cambria, Times New Roman, serif',
                }}
              >
                Claude
              </h1>

              <button
                type="button"
                className="rounded-lg p-2 text-[#d5cfc6] transition hover:bg-[#2b2b29]"
                aria-label="Search conversations"
                title="Conversation search comes next"
              >
                <Icon name="search" />
              </button>
            </div>

            <nav className="mt-4 space-y-1">
              <SidebarItem
                label="New chat"
                icon={<Icon name="plus" />}
                onClick={() => openNewChat()}
              />

              <SidebarItem
                label="Chats"
                icon={<Icon name="chat" />}
                active
                onClick={() => {
                  document
                    .getElementById('recent-chats')
                    ?.scrollIntoView({
                      behavior: 'smooth',
                    })
                }}
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

            <div
              id="recent-chats"
              className="mt-5 flex min-h-0 flex-1 flex-col"
            >
              <div className="flex items-center justify-between px-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#827d75]">
                  Recents
                </p>

                {!loadingConversations &&
                  conversations.length > 0 && (
                    <span className="text-[11px] text-[#777169]">
                      {conversations.length}
                    </span>
                  )}
              </div>

              <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
                {loadingConversations && (
                  <p className="px-3 py-3 text-xs text-[#827d75]">
                    Loading chats...
                  </p>
                )}

                {!loadingConversations &&
                  conversationError && (
                    <p className="mx-2 rounded-lg bg-red-950/30 px-3 py-3 text-xs leading-5 text-red-200">
                      {conversationError}
                    </p>
                  )}

                {!loadingConversations &&
                  !conversationError &&
                  conversations.length === 0 && (
                    <p className="px-3 py-3 text-xs leading-5 text-[#827d75]">
                      Your conversations will appear here.
                    </p>
                  )}

                {!loadingConversations &&
                  !conversationError &&
                  conversations.map((conversation) => {
                    const conversationModel =
                      getConversationModel(
                        conversation
                      )

                    const isDeleting =
                      deletingConversationId ===
                      conversation.id

                    return (
                      <div
                        key={conversation.id}
                        className="group flex items-center rounded-lg transition hover:bg-[#2b2b29]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/chat/${conversation.model_id}?conversation=${conversation.id}`
                            )
                          }
                          disabled={isDeleting}
                          className="min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-wait disabled:opacity-55"
                        >
                          <p className="truncate text-sm text-[#ddd7ce]">
                            {conversation.title ||
                              'Untitled conversation'}
                          </p>

                          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-[#817b73]">
                            <span className="truncate">
                              {conversationModel?.name ||
                                'Claude'}
                            </span>

                            <span>·</span>

                            <span className="shrink-0">
                              {formatConversationDate(
                                conversation.created_at
                              )}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteConversation(
                              conversation
                            )
                          }
                          disabled={
                            deletingConversationId !== null
                          }
                          className="mr-2 rounded-md p-1.5 text-[#8c857d] opacity-100 transition hover:bg-red-950/40 hover:text-red-300 disabled:cursor-wait disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                          aria-label={`Delete ${
                            conversation.title ||
                            'untitled conversation'
                          }`}
                          title="Delete conversation"
                        >
                          {isDeleting ? (
                            <span
                              className="block h-4 w-4 text-center text-xs leading-4"
                              aria-hidden="true"
                            >
                              …
                            </span>
                          ) : (
                            <Icon
                              name="trash"
                              className="h-4 w-4"
                            />
                          )}
                        </button>
                      </div>
                    )
                  })}
              </div>
            </div>

            <div className="mt-3 border-t border-[#33322f] pt-3">
              <div className="flex items-center gap-3 rounded-xl px-2 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5ded3] text-xs font-semibold text-[#2a2926]">
                  {getInitials(profile.full_name)}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#eee9e1]">
                    {profile.full_name?.trim() || 'Customer'}
                  </p>

                  <p className="truncate text-[11px] text-[#8f8981]">
                    {profile.credits.toLocaleString()}{' '}
                    credits
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="rounded-lg p-2 text-[#8f8981] transition hover:bg-[#2b2b29] hover:text-[#eee9e1] disabled:opacity-50"
                  title="Sign out"
                  aria-label="Sign out"
                >
                  <Icon
                    name="logout"
                    className="h-4 w-4"
                  />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main className="relative min-h-screen overflow-hidden">
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <div className="rounded-xl border border-[#343330] bg-[#242421] px-3 py-1.5 text-xs text-[#9d978f] shadow-sm">
              {subscription.plans.name}
              <span className="mx-1.5 text-[#595650]">
                ·
              </span>
              <span className="capitalize text-[#c8c1b8]">
                {subscription.status}
              </span>
            </div>
          </div>

          <div className="flex min-h-screen items-center justify-center px-5 pb-16 pt-20 sm:px-8">
            <div className="w-full max-w-[690px] -translate-y-3">
              <div className="flex items-center justify-center gap-3">
                <div className="text-[#df6b45]">
                  <Icon
                    name="spark"
                    className="h-9 w-9"
                  />
                </div>

                <h2
                  className="text-center text-[40px] leading-tight tracking-[-0.025em] text-[#e5ded3] sm:text-[45px]"
                  style={{
                    fontFamily:
                      'Georgia, Cambria, Times New Roman, serif',
                  }}
                >
                  Welcome, {getFirstName(profile.full_name)}
                </h2>
              </div>

              <form
                onSubmit={handleSubmit}
                className="mt-9 rounded-[22px] border border-[#353431] bg-[#2a2a28] p-4 shadow-[0_16px_50px_rgba(0,0,0,0.22)]"
              >
                <textarea
                  value={draft}
                  onChange={(event) =>
                    setDraft(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey
                    ) {
                      event.preventDefault()
                      openNewChat()
                    }
                  }}
                  placeholder="How can I help you today?"
                  rows={3}
                  maxLength={10000}
                  disabled={!canStartChat}
                  className="min-h-[68px] w-full resize-none bg-transparent px-1 text-[16px] leading-7 text-[#ebe6de] outline-none placeholder:text-[#b4aa9d] disabled:cursor-not-allowed"
                />

                <div className="mt-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled
                      title="Attachments will be enabled in the next step"
                      className="rounded-lg p-2 text-[#f0ece4] opacity-65"
                    >
                      <Icon name="plus" />
                    </button>
                  </div>

                  <div className="flex min-w-0 items-center gap-2">
                    <label className="min-w-0">
                      <span className="sr-only">
                        Claude model
                      </span>

                      <select
                        value={selectedModelId}
                        onChange={(event) =>
                          setSelectedModelId(
                            event.target.value
                          )
                        }
                        className="max-w-[190px] cursor-pointer appearance-none bg-transparent py-2 text-right text-sm font-semibold text-[#f0ece4] outline-none"
                      >
                        {models.map((model) => (
                          <option
                            key={model.id}
                            value={model.id}
                            className="bg-[#2a2a28] text-[#f0ece4]"
                          >
                            {model.name.replace(
                              /^Claude\s+/i,
                              ''
                            )}
                          </option>
                        ))}
                      </select>
                    </label>

                    <select
                      value={reasoningEffort}
                      onChange={(event) => {
                        const nextReasoningEffort =
                          normalizeReasoningEffort(
                            event.target.value
                          )

                        setReasoningEffort(
                          nextReasoningEffort
                        )
                        storeReasoningEffort(
                          nextReasoningEffort
                        )
                      }}
                      disabled={!canStartChat}
                      title="Reasoning effort"
                      aria-label="Reasoning effort"
                      className="max-w-[105px] cursor-pointer appearance-none rounded-lg bg-[#333330] px-2.5 py-2 text-xs font-medium text-[#d8d2c9] outline-none transition hover:bg-[#3a3935] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option
                        value="low"
                        className="bg-[#2a2a28]"
                      >
                        Low
                      </option>
                      <option
                        value="medium"
                        className="bg-[#2a2a28]"
                      >
                        Medium
                      </option>
                      <option
                        value="high"
                        className="bg-[#2a2a28]"
                      >
                        High
                      </option>
                    </select>

                    <button
                      type="button"
                      disabled
                      title="Voice input will be enabled later"
                      className="rounded-lg p-2 text-[#f0ece4] opacity-55"
                    >
                      <Icon name="mic" />
                    </button>

                    {draft.trim() ? (
                      <button
                        type="submit"
                        disabled={!canStartChat}
                        className="rounded-full bg-[#eee9e1] p-2 text-[#272624] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Start chat"
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
                        title="Voice conversation will be added later"
                        className="rounded-lg p-2 text-[#bcb6ae] opacity-55"
                      >
                        <Icon name="wave" />
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setDraft(preset.prompt)
                    }
                    disabled={!canStartChat}
                    className="rounded-lg border border-[#3b3a37] bg-[#2d2d2a] px-3 py-2 text-sm text-[#eee9e1] transition hover:bg-[#363633] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {!canStartChat && (
                <div className="mt-5 rounded-xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-center text-sm leading-6 text-amber-200">
                  {profile.credits <= 0
                    ? 'No credits remain on this account. Contact the administrator to add credits.'
                    : subscription.status !== 'active'
                      ? 'This Claude subscription is inactive.'
                      : 'No Claude models are currently available.'}
                </div>
              )}

              {selectedModel && (
                <p className="mt-7 text-center text-[11px] text-[#69655f]">
                  {getModelFamily(
                    selectedModel.name
                  )}{' '}
                  selected · Claude can make mistakes.
                  Review important information.
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Portal