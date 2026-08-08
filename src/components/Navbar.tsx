function Navbar() {
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-cyan-300/10 bg-[#040b16]/90 text-white backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" className="flex items-center gap-3">
          <img
            src="/gametrusthub-logo.jpeg"
            alt="GameTrustHub logo"
            className="h-11 w-11 rounded-xl border border-cyan-300/20 object-cover shadow-[0_0_24px_rgba(34,211,238,0.16)]"
          />
          <div>
            <div className="text-lg font-black tracking-tight sm:text-xl">
              <span className="text-cyan-300">GAME</span>
              <span className="text-amber-300">TRUSTHUB</span>
            </div>
            <div className="hidden text-[10px] uppercase tracking-[0.28em] text-slate-500 sm:block">
              AI & Digital Services
            </div>
          </div>
        </a>

        <div className="flex items-center gap-5 text-sm font-medium text-slate-300 sm:gap-7">
          <a href="/" className="transition hover:text-cyan-300">
            Home
          </a>
          <a href="#services" className="transition hover:text-cyan-300">
            Services
          </a>
          <a
            href="/login"
            className="rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-2 text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-300/10"
          >
            Login
          </a>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
