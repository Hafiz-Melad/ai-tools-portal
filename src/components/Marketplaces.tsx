type Marketplace = {
  name: string
  description: string
  href: string
  accentClass: string
  badgeClass: string
}

const marketplaces: Marketplace[] = [
  {
    name: 'Eldorado',
    description:
      'Visit the official GameTrustHub shop on Eldorado to browse our available marketplace listings.',
    href: 'https://www.eldorado.gg/users/GameTrustHub/shop',
    accentClass: 'from-amber-300/18 via-amber-300/[0.04] to-transparent',
    badgeClass: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-200',
  },
  {
    name: 'G2G',
    description:
      'Browse the GameTrustHub storefront on G2G for our currently available digital marketplace listings.',
    href: 'https://www.g2g.com/GameTrustHub',
    accentClass: 'from-cyan-300/18 via-cyan-300/[0.04] to-transparent',
    badgeClass: 'border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200',
  },
]

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 5h5v5M19 5l-8 8M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Marketplaces() {
  return (
    <section id="stores" className="scroll-mt-24 px-6 py-20 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-cyan-300">
            Our Marketplace Stores
          </p>
          <h2 className="mt-4 text-4xl font-black md:text-5xl">
            Find GameTrustHub on digital marketplaces
          </h2>
          <p className="mt-5 text-lg leading-8 text-slate-400">
            Prefer shopping through a marketplace? Visit our GameTrustHub stores
            on Eldorado and G2G to browse the listings currently available there.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {marketplaces.map((marketplace) => (
            <article
              key={marketplace.name}
              className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 transition duration-300 hover:-translate-y-1 hover:border-white/20 md:p-9"
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${marketplace.accentClass}`}
              />

              <div className="relative flex h-full flex-col">
                <span
                  className={`w-fit rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${marketplace.badgeClass}`}
                >
                  Digital Marketplace
                </span>

                <h3 className="mt-7 text-3xl font-black tracking-tight">
                  {marketplace.name}
                </h3>

                <p className="mt-4 max-w-xl flex-1 leading-7 text-slate-400">
                  {marketplace.description}
                </p>

                <a
                  href={marketplace.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-100"
                  aria-label={`Visit GameTrustHub on ${marketplace.name}`}
                >
                  Visit our {marketplace.name} store
                  <ExternalLinkIcon />
                </a>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-7 text-center text-xs leading-5 text-slate-600">
          Marketplace availability, pricing and transaction terms are determined
          by the listings shown on each marketplace.
        </p>
      </div>
    </section>
  )
}

export default Marketplaces
