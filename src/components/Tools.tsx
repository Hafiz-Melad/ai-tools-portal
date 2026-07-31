const tools = [
  {
    name: 'ChatGPT',
    description: 'Advanced AI for writing, coding and research',
  },
  {
    name: 'Claude',
    description: 'Long documents and deep reasoning',
  },
  {
    name: 'Grok',
    description: 'Real-time AI answers and information',
  },
  {
    name: 'Gemini',
    description: 'Google AI with powerful capabilities',
  },
  {
    name: 'Perplexity',
    description: 'AI search and research assistant',
  },
]

function Tools() {
  return (
    <section id="tools" className="bg-black text-white py-20 px-6">

      <div className="max-w-6xl mx-auto">

        <h2 className="text-4xl font-bold text-center">
          Premium AI Tools Included
        </h2>

        <p className="text-gray-400 text-center mt-4">
          Access the most popular AI models from one platform.
        </p>


        <div className="grid md:grid-cols-3 gap-6 mt-12">

          {tools.map((tool) => (
            <div
              key={tool.name}
              className="border border-white/10 rounded-2xl p-6 hover:bg-white/5 transition"
            >

              <h3 className="text-2xl font-semibold">
                {tool.name}
              </h3>

              <p className="text-gray-400 mt-3">
                {tool.description}
              </p>

            </div>
          ))}

        </div>

      </div>

    </section>
  )
}

export default Tools