function Hero() {
  return (
    <section className="min-h-[80vh] bg-black text-white flex items-center justify-center px-6">
      <div className="max-w-4xl text-center">

        <h1 className="text-5xl md:text-7xl font-bold leading-tight">
          All Your Favorite AI Tools
          <span className="block text-gray-400">
            In One Simple Subscription
          </span>
        </h1>

        <p className="mt-6 text-lg text-gray-300 max-w-2xl mx-auto">
          Access powerful AI models like ChatGPT, Claude, Grok,
          Gemini and Perplexity from one secure dashboard.
        </p>

        <div className="mt-8 flex justify-center gap-4">

          <button className="bg-white text-black px-8 py-3 rounded-xl font-semibold hover:bg-gray-200">
            Get Started
          </button>

          <button className="border border-white/20 px-8 py-3 rounded-xl hover:bg-white/10">
            View Plans
          </button>

        </div>

      </div>
    </section>
  )
}

export default Hero