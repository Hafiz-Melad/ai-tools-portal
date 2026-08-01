import { useEffect, useState } from 'react'
import type {
  FormEvent,
  KeyboardEvent,
} from 'react'

import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type AIModel = {
  id: string
  name: string
  provider: string
  model_key: string
  description: string
  enabled: boolean
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
}

type ChatApiResponse = {
  success: boolean
  reply?: string
  error?: string
  conversationId?: string
  creditsRemaining?: number
  creditsUsed?: number
  providerCostUsd?: number
}

const CHAT_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/chat'
  : '/api/chat'

function Chat() {
  const { modelId } = useParams()
  const navigate = useNavigate()

  const [model, setModel] = useState<AIModel | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [conversationId, setConversationId] =
    useState<string | null>(null)

  const [creditsRemaining, setCreditsRemaining] =
    useState<number | null>(null)

  const [lastCreditsUsed, setLastCreditsUsed] =
    useState<number | null>(null)

  useEffect(() => {
    async function loadModel() {
      setLoading(true)
      setError(null)
      setModel(null)
      setMessages([])
      setMessage('')
      setConversationId(null)
      setCreditsRemaining(null)
      setLastCreditsUsed(null)

      try {
        if (!modelId) {
          throw new Error('No AI model was selected.')
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (!user) {
          throw new Error('You must log in first.')
        }

        /*
         * Load the customer's current credit balance.
         */
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', user.id)
          .single()

        if (profileError) {
          throw profileError
        }

        if (typeof profileData.credits !== 'number') {
          throw new Error(
            'Your credit balance could not be loaded.'
          )
        }

        setCreditsRemaining(profileData.credits)

        /*
         * Load the customer's active subscription.
         */
        const {
          data: subscription,
          error: subscriptionError,
        } = await supabase
          .from('subscriptions')
          .select('plan_id, status')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle()

        if (subscriptionError) {
          throw subscriptionError
        }

        if (!subscription) {
          throw new Error('No subscription was found.')
        }

        if (subscription.status !== 'active') {
          throw new Error(
            'Your subscription is not active.'
          )
        }

        /*
         * Verify that the selected model belongs to the plan.
         */
        const {
          data: modelAccess,
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
          .eq('model_id', modelId)
          .maybeSingle()

        if (modelError) {
          throw modelError
        }

        const selectedModel =
          modelAccess?.ai_models as unknown as
            | AIModel
            | null

        if (!selectedModel) {
          throw new Error(
            'This model is not included in your plan.'
          )
        }

        if (!selectedModel.enabled) {
          throw new Error(
            'This model is currently unavailable.'
          )
        }

        setModel(selectedModel)
      } catch (err) {
        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the selected model.'
        )
      } finally {
        setLoading(false)
      }
    }

    void loadModel()
  }, [modelId])

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()

    const cleanedMessage = message.trim()

    if (
      !cleanedMessage ||
      !model ||
      sending
    ) {
      return
    }

    setError(null)
    setSending(true)
    setMessage('')

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: cleanedMessage,
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

      const response = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: {
          Authorization:
            `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          modelId: model.id,
          message: cleanedMessage,
          conversationId,
        }),
      })

      let result: ChatApiResponse

      try {
        result =
          (await response.json()) as ChatApiResponse
      } catch {
        throw new Error(
          'The server returned an invalid response.'
        )
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || 'The AI request failed.'
        )
      }

      if (!result.reply) {
        throw new Error(
          'The AI returned an empty response.'
        )
      }

      if (
        typeof result.conversationId !== 'string' ||
        !result.conversationId.trim()
      ) {
        throw new Error(
          'The server did not return a valid conversation ID.'
        )
      }

      /*
       * The first response creates the conversation.
       * Later requests reuse the same conversation ID.
       */
      setConversationId(result.conversationId)

      if (
        typeof result.creditsRemaining === 'number'
      ) {
        setCreditsRemaining(
          result.creditsRemaining
        )
      }

      if (typeof result.creditsUsed === 'number') {
        setLastCreditsUsed(result.creditsUsed)
      }

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.reply,
      }

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ])
    } catch (err) {
      console.error(err)

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Could not send the message.'

      setError(errorMessage)

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${errorMessage}`,
        },
      ])
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault()
      void sendMessage()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading model...
      </div>
    )
  }

  if (error && !model) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full border border-red-500/30 bg-red-500/10 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-red-300">
            Chat unavailable
          </h1>

          <p className="text-red-200/80 mt-3">
            {error}
          </p>

          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="mt-6 bg-white text-black px-5 py-3 rounded-xl font-semibold"
          >
            Return to Portal
          </button>
        </div>
      </div>
    )
  }

  if (!model) {
    return null
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-6">
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="text-gray-300 hover:text-white"
          >
            ← Back to Portal
          </button>

          <div className="text-right">
            <h1 className="font-bold">
              {model.name}
            </h1>

            <p className="text-sm text-gray-400">
              {model.provider}
            </p>

            {creditsRemaining !== null && (
              <p className="text-sm text-green-400 mt-1">
                {creditsRemaining.toLocaleString()}{' '}
                credits remaining
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 flex flex-col">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">
            Chat with {model.name}
          </h2>

          <p className="text-gray-400 mt-2">
            {model.description}
          </p>
        </div>

        <div className="flex-1 min-h-[420px] border border-white/10 rounded-2xl p-5 overflow-y-auto space-y-5">
          {messages.length === 0 && (
            <div className="h-full min-h-[370px] flex items-center justify-center">
              <p className="text-gray-500">
                Send your first message to {model.name}.
              </p>
            </div>
          )}

          {messages.map((chatMessage) => (
            <div
              key={chatMessage.id}
              className={
                chatMessage.role === 'user'
                  ? 'flex justify-end'
                  : 'flex justify-start'
              }
            >
              <div
                className={
                  chatMessage.role === 'user'
                    ? 'max-w-[80%] rounded-2xl bg-white text-black px-5 py-4'
                    : 'max-w-[80%] rounded-2xl bg-white/10 text-white px-5 py-4'
                }
              >
                <p className="whitespace-pre-wrap">
                  {chatMessage.content}
                </p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-white/10 px-5 py-4 text-gray-400">
                {model.name} is thinking...
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 border border-red-500/30 bg-red-500/10 text-red-300 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {lastCreditsUsed !== null && (
          <p className="mt-4 text-sm text-gray-400">
            Last response used {lastCreditsUsed}{' '}
            credit
            {lastCreditsUsed === 1 ? '' : 's'}.
          </p>
        )}

        <form
          onSubmit={sendMessage}
          className="mt-6 flex gap-3"
        >
          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value)
            }
            onKeyDown={handleKeyDown}
            placeholder={`Message ${model.name}...`}
            rows={3}
            maxLength={10000}
            disabled={sending}
            className="flex-1 resize-none bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-white/30 disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={
              sending || !message.trim()
            }
            className="self-end bg-white text-black px-7 py-4 rounded-2xl font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>

        <p className="text-xs text-gray-600 mt-3">
          Press Enter to send. Use Shift + Enter for a new line.
        </p>
      </main>
    </div>
  )
}

export default Chat