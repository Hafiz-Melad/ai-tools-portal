import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Plan = {
  id: string
  name: string
  price: number
  credits: number
  description: string
  features: string[]
}

function Plans() {

  const [plans, setPlans] = useState<Plan[]>([])

  useEffect(() => {
    async function fetchPlans() {

      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('price')

      if (error) {
        console.error(error)
        return
      }

      setPlans(data || [])
    }

    fetchPlans()
  }, [])


  return (
    <section id="pricing" className="bg-black text-white py-20 px-6">

      <div className="max-w-7xl mx-auto">

        <h2 className="text-4xl font-bold text-center">
          Choose Your AI Plan
        </h2>

        <p className="text-gray-400 text-center mt-4">
          Access powerful AI tools from one platform.
        </p>


        <div className="grid md:grid-cols-3 gap-6 mt-12">

          {plans.map((plan) => (

            <div
              key={plan.id}
              className="border border-white/10 rounded-2xl p-6 hover:bg-white/5"
            >

              <h3 className="text-2xl font-bold">
                {plan.name}
              </h3>

              <div className="text-3xl font-bold mt-4">
                Rs {plan.price}
              </div>

              <p className="text-gray-400 mt-2">
                {plan.credits.toLocaleString()} credits
              </p>


              <p className="mt-4 text-gray-300">
                {plan.description}
              </p>


              <ul className="mt-5 space-y-2">

                {plan.features?.map((feature) => (
                  <li key={feature}>
                    ✓ {feature}
                  </li>
                ))}

              </ul>


              <button className="mt-6 w-full bg-white text-black py-3 rounded-xl font-semibold">
                Get Started
              </button>


            </div>

          ))}

        </div>

      </div>

    </section>
  )
}

export default Plans