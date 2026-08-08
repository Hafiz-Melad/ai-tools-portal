function Hero() {
  return (
    <section className="relative overflow-hidden px-6 py-20 text-white md:py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-cyan-400/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-400/10 blur-[110px]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.08fr_0.92fr]">
        <div>
          <div className="inline-flex items-center rounded-full border border-amber-300/20 bg-amber-300/5 px-4 py-2 text-sm font-semibold text-amber-200">
            $1 AI credit purchase = 100,000 GameTrustHub credits
          </div>

          <h1 className="mt-7 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight md:text-7xl">
            One Trusted Hub for
            <span className="block bg-gradient-to-r from-cyan-300 via-sky-300 to-amber-300 bg-clip-text text-transparent">
              AI & Premium Digital Services
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 md:text-xl">
            GameTrustHub brings AI access, popular digital services and direct
            support together in one simple place.
          </p>

          <div className="mt-9 flex flex-wrap gap-4">
            <a
              href="#services"
              className="rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 px-7 py-3.5 font-bold text-[#04101d] shadow-[0_12px_36px_rgba(34,211,238,0.18)] transition hover:-translate-y-0.5"
            >
              Explore Services
            </a>
            <a
              href="/login"
              className="rounded-xl border border-amber-300/25 bg-amber-300/5 px-7 py-3.5 font-bold text-amber-100 transition hover:border-amber-300/45 hover:bg-amber-300/10"
            >
              Claude Login
            </a>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
            <span>✓ Direct WhatsApp support</span>
            <span>✓ Private AI workspace</span>
            <span>✓ Simple credit access</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[500px]">
          <div className="absolute inset-8 rounded-full bg-cyan-300/15 blur-3xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
            <img
              src="/gametrusthub-logo.jpeg"
              alt="GameTrustHub"
              className="aspect-square w-full rounded-[1.6rem] object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
