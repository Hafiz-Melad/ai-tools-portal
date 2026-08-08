const highlights = [
  {
    number: '01',
    title: 'Claude AI Workspace',
    description:
      'Use Claude through your private GameTrustHub login with simple credit-based access.',
  },
  {
    number: '02',
    title: 'Premium Digital Services',
    description:
      'Ask about Spotify Premium, Netflix, ChatGPT and Perplexity service options from one place.',
  },
  {
    number: '03',
    title: 'Direct Human Support',
    description:
      'Have a question before ordering? Message GameTrustHub directly on WhatsApp for help.',
  },
]

function Tools() {
  return (
    <section className="px-6 py-20 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
            Why GameTrustHub
          </p>
          <h2 className="mt-4 text-4xl font-black md:text-5xl">
            Everything you need, without the clutter
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">
            AI access, premium services and direct support are organized around
            one simple goal: making access easy.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {highlights.map((item) => (
            <article
              key={item.number}
              className="rounded-3xl border border-cyan-300/10 bg-gradient-to-br from-cyan-300/[0.06] to-amber-300/[0.025] p-7 shadow-[0_18px_60px_rgba(0,0,0,0.2)]"
            >
              <div className="text-sm font-black tracking-[0.18em] text-amber-300">
                {item.number}
              </div>
              <h3 className="mt-5 text-2xl font-bold">{item.title}</h3>
              <p className="mt-4 leading-7 text-slate-400">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

export default Tools
