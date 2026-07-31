import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function Portal() {

  const [profile, setProfile] = useState<any>(null)
  const [subscription, setSubscription] = useState<any>(null)
  const [models, setModels] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)


  useEffect(() => {

    async function loadData() {

      try {

        const {
          data: { user }
        } = await supabase.auth.getUser()


        if (!user) {
          throw new Error("No user found")
        }


        const { data: profileData, error: profileError } =
          await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()


        if (profileError) throw profileError


        setProfile(profileData)



        const { data: subscriptionData, error: subscriptionError } =
          await supabase
            .from('subscriptions')
            .select(`
              *,
              plans (
                id,
                name,
                price
              )
            `)
            .eq('user_id', user.id)
            .single()


        if (subscriptionError) throw subscriptionError


        setSubscription(subscriptionData)



        const { data: modelData, error: modelError } =
          await supabase
            .from('plan_models')
            .select(`
              ai_models (
                name,
                provider,
                description
              )
            `)
            .eq('plan_id', subscriptionData.plan_id)


        if (modelError) throw modelError


        setModels(
          modelData.map((item:any) => item.ai_models)
        )


      } catch (err:any) {

        console.error(err)
        setError(err.message)

      }

    }


    loadData()

  }, [])



  if (error) {

    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        {error}
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
              {profile.credits}
            </h2>

          </div>


          <div className="border border-white/10 rounded-2xl p-6">

            <p className="text-gray-400">
              Status
            </p>

            <h2 className="text-3xl font-bold mt-2">
              {subscription.status}
            </h2>

          </div>


        </div>



        <div className="mt-12">

          <h2 className="text-3xl font-bold">
            Available AI Models
          </h2>


          <div className="grid md:grid-cols-3 gap-6 mt-6">


            {models.map((model:any) => (

              <div
                key={model.name}
                className="border border-white/10 rounded-2xl p-6"
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

              </div>

            ))}


          </div>

        </div>


      </div>

    </div>

  )

}


export default Portal