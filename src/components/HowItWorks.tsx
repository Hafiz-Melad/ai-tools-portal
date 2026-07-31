function HowItWorks() {

  const steps = [
    {
      number: '01',
      title: 'Choose Your Plan',
      description:
        'Select the AI package that fits your needs.'
    },
    {
      number: '02',
      title: 'Complete Payment',
      description:
        'Pay securely and confirm your order.'
    },
    {
      number: '03',
      title: 'Receive Access',
      description:
        'Get your private portal login details.'
    },
    {
      number: '04',
      title: 'Start Using AI',
      description:
        'Access your available AI tools instantly.'
    }
  ]


  return (
    <section className="bg-black text-white py-20 px-6">

      <div className="max-w-6xl mx-auto">

        <h2 className="text-4xl font-bold text-center">
          How It Works
        </h2>


        <div className="grid md:grid-cols-4 gap-6 mt-12">

          {steps.map((step) => (

            <div
              key={step.number}
              className="border border-white/10 rounded-2xl p-6"
            >

              <div className="text-gray-400 text-xl">
                {step.number}
              </div>

              <h3 className="text-xl font-bold mt-4">
                {step.title}
              </h3>

              <p className="text-gray-400 mt-3">
                {step.description}
              </p>

            </div>

          ))}

        </div>

      </div>

    </section>
  )
}

export default HowItWorks