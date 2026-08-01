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

function Portal() {
  const navigate = useNavigate()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [subscription, setSubscription] =
    useState<Subscription | null>(null)
  const [models, setModels] = useState<AIModel[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          throw new Error('No user found')
        }

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
          .single()

        if (subscriptionError) {
          throw subscriptionError
        }

        setSubscription(
          subscriptionData as unknown as Subscription
        )

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
              model !== null && model.enabled === true
          )

        setModels(availableModels)
      } catch (err) {
        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the portal.'
        )
      }
    }

    loadData()
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
            <p className="text-gray-400">Your Plan</p>

            <h2 className="text-3xl font-bold mt-2">
              {subscription.plans.name}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-6">
            <p className="text-gray-400">Credits</p>

            <h2 className="text-3xl font-bold mt-2">
              {profile.credits}
            </h2>
          </div>

          <div className="border border-white/10 rounded-2xl p-6">
            <p className="text-gray-400">Status</p>

            <h2 className="text-3xl font-bold mt-2 capitalize">
              {subscription.status}
            </h2>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-3xl font-bold">
            Available AI Models
          </h2>

          <p className="text-gray-400 mt-2">
            Select a model to start chatting.
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
                  Open Chat →
                </p>
              </button>
            ))}
          </div>

          {models.length === 0 && (
            <div className="border border-white/10 rounded-2xl p-6 mt-6 text-gray-400">
              No AI models are currently available.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Portal