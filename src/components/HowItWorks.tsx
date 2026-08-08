const steps = [
  {
    number: '01',
    title: 'Explore GameTrustHub',
    description:
      'Choose Claude AI access or one of the premium digital services listed on the homepage.',
  },
  {
    number: '02',
    title: 'Login or Message Us',
    description:
      'Use the Claude login directly, or contact us on WhatsApp for other services and questions.',
  },
  {
    number: '03',
    title: 'Confirm Your Access',
    description:
      'Complete the required payment or account setup for the service you selected.',
  },
  {
    number: '04',
    title: 'Start Using Your Service',
    description:
      'Receive access and start using your selected GameTrustHub service.',
  },
]

function HowItWorks() {
  return (
    <section className="px-6 pb-28 pt-20 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
            Simple Process
          </p>
          <h2 className="mt-4 text-4xl font-black md:text-5xl">
            From discovery to access in four steps
          </h2>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step) => (
            <article
              key={step.number}
              className="rounded-3xl border border-white/10 bg-white/[0.025] p-7"
            >
              <div className="text-2xl font-black text-amber-300">
                {step.number}
              </div>
              <h3 className="mt-5 text-xl font-bold">{step.title}</h3>
              <p className="mt-4 text-sm leading-6 text-slate-400">
                {step.description}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-5 rounded-3xl border border-cyan-300/10 bg-cyan-300/[0.04] px-7 py-6 text-center sm:flex-row sm:text-left">
          <div>
            <div className="font-bold text-white">GameTrustHub</div>
            <div className="mt-1 text-sm text-slate-500">
              AI access • Premium digital services • Direct support
            </div>
          </div>
          <a
            href="#services"
            className="text-sm font-bold text-cyan-300 transition hover:text-cyan-200"
          >
            Browse services →
          </a>
        </div>
      </div>
    </section>
  )
}

export default HowItWorks
