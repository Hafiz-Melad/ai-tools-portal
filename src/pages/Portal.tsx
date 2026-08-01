import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Profile = {
  full_name: string
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
  error?: string
}

const HISTORY_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/history'
  : '/api/history'

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
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function Portal() {
  const navigate = useNavigate()

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [subscription, setSubscription] =
    useState<Subscription | null>(null)

  const [models, setModels] =
    useState<AIModel[]>([])

  const [conversations, setConversations] =
    useState<Conversation[]>([])

  const [loadingConversations, setLoadingConversations] =
    useState(true)

  const [conversationError, setConversationError] =
    useState<string | null>(null)

  const [error, setError] =
    useState<string | null>(null)

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
          .map((item: any) => item.ai_models)
          .filter(
            (model: AIModel | null) =>
              model !== null &&
              model.enabled === true
          )

        setModels(availableModels)

        /*
         * Load saved conversations through the protected API.
         * A history error does not prevent the main portal from loading.
         */
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

          setConversations(
            historyResult.conversations ?? []
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
            : 'Could not load the portal.'
        )

        setLoadingConversations(false)
      }
    }

    void loadData()
  }, [])

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="border border-red-500/30 bg-red-500/10 rounded-2xl p-6 text-red-300">
          {error}
        </div>
      </div>
    )
  }

  if (!profile || !subscription) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white px-6 py-20">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-4xl font-bold">
          Welcome, {profile.full_name}
        </h1>

        <div className="grid md:grid-cols-3 gap-6 mt-10">
          <div className="border border-white/10 rounded-2xl p-6">
            <p className="text-gray-400">
              Your Plan
            </p>

            <h2 className="text-3xl font-bold mt-2">
              {subscription.plans.name}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-6">
            <p className="text-gray-400">
              Credits
            </p>

            <h2 className="text-3xl font-bold mt-2">
              {profile.credits.toLocaleString()}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-6">
            <p className="text-gray-400">
              Status
            </p>

            <h2 className="text-3xl font-bold mt-2 capitalize">
              {subscription.status}
            </h2>
          </div>
        </div>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">
                Recent Conversations
              </h2>

              <p className="text-gray-400 mt-2">
                Reopen a saved chat and continue where you stopped.
              </p>
            </div>
          </div>

          {loadingConversations && (
            <div className="border border-white/10 rounded-2xl p-6 mt-6 text-gray-400">
              Loading conversations...
            </div>
          )}

          {!loadingConversations &&
            conversationError && (
              <div className="border border-red-500/30 bg-red-500/10 rounded-2xl p-6 mt-6 text-red-300">
                {conversationError}
              </div>
            )}

          {!loadingConversations &&
            !conversationError &&
            conversations.length === 0 && (
              <div className="border border-white/10 rounded-2xl p-6 mt-6 text-gray-400">
                You do not have any saved conversations yet.
              </div>
            )}

          {!loadingConversations &&
            !conversationError &&
            conversations.length > 0 && (
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                {conversations.map((conversation) => {
                  const conversationModel =
                    getConversationModel(conversation)

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() =>
                        navigate(
                          `/chat/${conversation.model_id}?conversation=${conversation.id}`
                        )
                      }
                      className="border border-white/10 rounded-2xl p-5 text-left transition hover:border-white/30 hover:bg-white/5"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="font-bold truncate">
                            {conversation.title ||
                              'Untitled conversation'}
                          </h3>

                          <p className="text-sm text-gray-400 mt-2">
                            {conversationModel?.name ||
                              'AI model'}
                          </p>

                          {conversationModel?.provider && (
                            <p className="text-xs text-gray-500 mt-1">
                              {conversationModel.provider}
                            </p>
                          )}
                        </div>

                        <span className="text-sm text-gray-400 shrink-0">
                          Open →
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 mt-4">
                        {formatConversationDate(
                          conversation.created_at
                        )}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
        </section>

        <section className="mt-14">
          <h2 className="text-3xl font-bold">
            Available AI Models
          </h2>

          <p className="text-gray-400 mt-2">
            Select a model to start a new conversation.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mt-6">
            {models.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() =>
                  navigate(`/chat/${model.id}`)
                }
                className="border border-white/10 rounded-2xl p-6 text-left cursor-pointer transition hover:border-white/30 hover:bg-white/5"
              >
                <h3 className="text-xl font-bold">
                  {model.name}
                </h3>

                <p className="text-gray-400 mt-2">
                  {model.provider}
                </p>

                <p className="text-sm text-gray-500 mt-3">
                  {model.description}
                </p>

                <p className="text-sm font-semibold mt-5">
                  Start New Chat →
                </p>
              </button>
            ))}
          </div>

          {models.length === 0 && (
            <div className="border border-white/10 rounded-2xl p-6 mt-6 text-gray-400">
              No AI models are currently available.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default Portal