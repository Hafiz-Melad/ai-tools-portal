const WHATSAPP_NUMBER = '923369883734'

type Service = {
  name: string
  eyebrow: string
  description: string
  accentClass: string
  message: string
}

const services: Service[] = [
  {
    name: 'Spotify Premium',
    eyebrow: 'Music',
    description:
      'Premium subscription options with fast, direct support through WhatsApp.',
    accentClass: 'from-emerald-400/20 to-emerald-400/5',
    message:
      "Hi, I'm interested in Spotify Premium. Please send me the available options and pricing.",
  },
  {
    name: 'Netflix',
    eyebrow: 'Streaming',
    description:
      'One month Personal Netflix Accounts.',
    accentClass: 'from-red-500/20 to-red-500/5',
    message:
      "Hi, I'm interested in Netflix. Please send me the available options and pricing.",
  },
  {
    name: 'ChatGPT Plus Shared Account',
    eyebrow: 'AI Service',
    description:
      'Contact us directly for availability and pricing.',
    accentClass: 'from-teal-400/20 to-teal-400/5',
    message:
      "Hi, I'm interested in your ChatGPT service. Please send me the available options and pricing.",
  },
  {
    name: 'Perplexity Pro Shared Account',
    eyebrow: 'AI Service',
    description:
      'Get current Perplexity service options and support directly through WhatsApp.',
    accentClass: 'from-cyan-400/20 to-cyan-400/5',
    message:
      "Hi, I'm interested in your Perplexity service. Please send me the available options and pricing.",
  },
]

function createWhatsAppUrl(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`
}

function WhatsAppIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.52 3.48A11.82 11.82 0 0 0 12.08 0C5.5 0 .15 5.35.15 11.93c0 2.1.55 4.16 1.6 5.97L.05 24l6.25-1.64a11.92 11.92 0 0 0 5.77 1.47h.01c6.58 0 11.93-5.35 11.93-11.93 0-3.19-1.24-6.18-3.49-8.42ZM12.08 21.8h-.01a9.84 9.84 0 0 1-5.02-1.38l-.36-.21-3.71.97.99-3.62-.23-.37a9.88 9.88 0 1 1 8.34 4.61Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.09 4.5.71.31 1.27.49 1.7.63.71.23 1.36.19 1.87.12.57-.08 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z"
        fill="currentColor"
      />
    </svg>
  )
}

function Services() {
  const generalSupportUrl = createWhatsAppUrl(
    "Hi, I visited your website and I'd like some help with your services."
  )

  return (
    <>
      <section id="services" className="bg-black px-6 py-20 text-white">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-emerald-400">
              More Services
            </p>

            <h2 className="mt-4 text-4xl font-bold md:text-5xl">
              Premium services, one message away
            </h2>

            <p className="mt-4 text-lg leading-8 text-gray-400">
              Looking for something beyond the AI portal? Contact us on WhatsApp
              for current availability, pricing and support.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {services.map((service) => (
              <article
                key={service.name}
                className="group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.055]"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${service.accentClass} opacity-80`}
                />

                <div className="relative flex h-full flex-col">
                  <span className="w-fit rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                    {service.eyebrow}
                  </span>

                  <h3 className="mt-6 text-2xl font-semibold leading-tight">
                    {service.name}
                  </h3>

                  <p className="mt-3 flex-1 text-sm leading-6 text-gray-400">
                    {service.description}
                  </p>

                  <a
                    href={createWhatsAppUrl(service.message)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black transition hover:bg-gray-200"
                    aria-label={`Contact us on WhatsApp about ${service.name}`}
                  >
                    <WhatsAppIcon />
                    Contact on WhatsApp
                  </a>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-8 text-center text-xs leading-5 text-gray-600">
            Availability and service terms may vary. Product and brand names belong
            to their respective owners.
          </p>
        </div>
      </section>

      <a
        href={generalSupportUrl}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-3 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-black shadow-[0_18px_50px_rgba(0,0,0,0.45)] transition hover:scale-[1.03] hover:bg-[#2be475] focus:outline-none focus:ring-2 focus:ring-white/80 md:bottom-7 md:right-7"
        aria-label="Chat with us on WhatsApp"
      >
        <WhatsAppIcon className="h-6 w-6" />
        <span className="hidden sm:inline">Chat on WhatsApp</span>
      </a>
    </>
  )
}

export default Services