type Environment = {
  PERPLEXITY_API_KEY?: string
}

type FunctionContext = {
  env: Environment
}

export async function onRequestGet(
  context: FunctionContext
): Promise<Response> {
  try {
    const apiKey = context.env.PERPLEXITY_API_KEY?.trim()

    if (!apiKey) {
      return Response.json(
        {
          success: false,
          error: 'PERPLEXITY_API_KEY is missing in Cloudflare.',
        },
        { status: 500 }
      )
    }

    const perplexityResponse = await fetch(
      'https://api.perplexity.ai/v1/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }
    )

    const responseText = await perplexityResponse.text()

    if (!perplexityResponse.ok) {
      return Response.json(
        {
          success: false,
          error: 'Perplexity model request failed.',
          status: perplexityResponse.status,
          details: responseText,
        },
        { status: 502 }
      )
    }

    const modelData = JSON.parse(responseText)

    return Response.json(
      {
        success: true,
        models: modelData,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown server error',
      },
      { status: 500 }
    )
  }
}