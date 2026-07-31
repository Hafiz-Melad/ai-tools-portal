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
    // Confirms that Cloudflare can see the encrypted secret.
    // The actual key is never returned.
    if (!context.env.PERPLEXITY_API_KEY) {
      return Response.json(
        {
          success: false,
          error: 'PERPLEXITY_API_KEY is not available in Cloudflare.',
        },
        { status: 500 }
      )
    }

    // Perplexity's model-discovery endpoint currently requires no
    // authentication. We still verify the secret above because later
    // chat requests will require it.
    const perplexityResponse = await fetch(
      'https://api.perplexity.ai/v1/models',
      {
        method: 'GET',
        headers: {
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
        secretConfigured: true,
        models: modelData,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error'

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}