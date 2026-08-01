import { useEffect, useState } from 'react'
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

function Chat() {
  const { modelId } = useParams()
  const navigate = useNavigate()

  const [model, setModel] = useState<AIModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadModel() {
      try {
        if (!modelId) {
          throw new Error('No AI model was selected.')
        }

        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error('You must log in first.')
        }

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
          throw new Error('Your subscription is not active.')
        }

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

        const selectedModel = modelAccess?.ai_models as unknown as
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

    loadModel()
  }, [modelId])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading model...
      </div>
    )
  }

  if (error || !model) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
        <div className="max-w-md w-full border border-red-500/30 bg-red-500/10 rounded-2xl p-6">
          <h1 className="text-xl font-bold text-red-300">
            Chat unavailable
          </h1>

          <p className="text-red-200/80 mt-3">
            {error || 'The selected model could not be loaded.'}
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

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-6">
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
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-6">
          <h2 className="text-3xl font-bold">
            Chat with {model.name}
          </h2>

          <p className="text-gray-400 mt-2">
            {model.description}
          </p>
        </div>

        <div className="min-h-[400px] border border-white/10 rounded-2xl p-6">
          <p className="text-gray-400">
            Your conversation will appear here.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <textarea
            placeholder={`Message ${model.name}...`}
            rows={3}
            className="flex-1 resize-none bg-white/5 border border-white/10 rounded-2xl p-4 outline-none focus:border-white/30"
          />

          <button
            type="button"
            disabled
            className="self-end bg-white/40 text-black px-7 py-4 rounded-2xl font-semibold cursor-not-allowed"
          >
            Send
          </button>
        </div>

        <p className="text-xs text-gray-600 mt-3">
          API messaging will be connected in the next step.
        </p>
      </main>
    </div>
  )
}

export default Chat