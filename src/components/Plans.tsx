const WHATSAPP_NUMBER = '923369883734'

function Plans() {
  const buyCreditsUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    "Hi, I'd like to buy GameTrustHub Claude AI credits. Please send me the payment details."
  )}`

  return (
    <section className="px-6 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] border border-amber-300/15 bg-gradient-to-br from-cyan-300/[0.07] via-white/[0.025] to-amber-300/[0.08] p-8 md:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
                Claude AI Credits
              </p>
              <h2 className="mt-4 text-4xl font-black md:text-5xl">
                Simple credit-based Claude access
              </h2>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-300">
                Buy GameTrustHub AI credits, sign in to your private Claude
                workspace and use the Claude models available on your account.
              </p>

              <div className="mt-7 grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
                <div>✓ Private GameTrustHub login</div>
                <div>✓ Usage-based credit deduction</div>
                <div>✓ Available Claude models</div>
                <div>✓ Direct WhatsApp support</div>
              </div>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="/login"
                  className="rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 px-6 py-3 font-bold text-[#04101d] transition hover:-translate-y-0.5"
                >
                  Claude Login
                </a>
                <a
                  href={buyCreditsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-6 py-3 font-bold text-amber-100 transition hover:border-amber-300/45 hover:bg-amber-300/10"
                >
                  Buy Credits on WhatsApp
                </a>
              </div>
            </div>

            <div className="rounded-3xl border border-amber-300/20 bg-[#061321]/80 p-8 text-center shadow-[0_22px_70px_rgba(0,0,0,0.28)]">
              <div className="text-sm font-bold uppercase tracking-[0.24em] text-slate-400">
                Credit Rate
              </div>
              <div className="mt-5 text-5xl font-black text-amber-300 md:text-6xl">
                $1
              </div>
              <div className="mt-3 text-lg font-bold text-white">equals</div>
              <div className="mt-3 text-4xl font-black text-cyan-300 md:text-5xl">
                100,000
              </div>
              <div className="mt-2 font-semibold text-slate-300">
                GameTrustHub credits
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-500">
                100,000 credits = one lac credits.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Plans
