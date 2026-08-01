type Environment = {
  PERPLEXITY_API_KEY?: string
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
  MODEL_SYNC_SECRET?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type PerplexityModel = {
  id: string
  owned_by?: string
  pricing?: {
    input?: number
    output?: number
    cache_write?: number
    cache_read?: number
    unit?: string
  }
}

function createDisplayName(modelId: string): string {
  const modelName = modelId.split('/').pop() || modelId

  return modelName
    .split('-')
    .map((part) => {
      const lower = part.toLowerCase()

      if (lower === 'gpt') return 'GPT'
      if (lower === 'glm') return 'GLM'
      if (lower === 'xai') return 'xAI'
      if (lower === 'ai') return 'AI'
      if (lower === 'nvidia') return 'NVIDIA'

      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}

function createProviderName(provider?: string): string {
  const providers: Record<string, string> = {
    anthropic: 'Anthropic',
    google: 'Google',
    nvidia: 'NVIDIA',
    openai: 'OpenAI',
    perplexity: 'Perplexity',
    xai: 'xAI',
  }

  if (!provider) return 'Unknown'

  return providers[provider.toLowerCase()] || provider
}

export async function onRequestPost(
  context: FunctionContext
): Promise<Response> {
  try {
    const perplexityKey =
      context.env.PERPLEXITY_API_KEY?.trim()

    const supabaseUrl =
      context.env.SUPABASE_URL?.trim().replace(/\/$/, '')

    const supabaseSecretKey =
      context.env.SUPABASE_SECRET_KEY?.trim()

    const expectedSyncSecret =
      context.env.MODEL_SYNC_SECRET?.trim()

    const receivedSyncSecret =
      context.request.headers.get('x-sync-secret')?.trim()

    if (
      !perplexityKey ||
      !supabaseUrl ||
      !supabaseSecretKey ||
      !expectedSyncSecret
    ) {
      return Response.json(
        {
          success: false,
          error: 'One or more required server secrets are missing.',
        },
        { status: 500 }
      )
    }

    if (
      !receivedSyncSecret ||
      receivedSyncSecret !== expectedSyncSecret
    ) {
      return Response.json(
        {
          success: false,
          error: 'Unauthorized synchronization request.',
        },
        { status: 401 }
      )
    }

    async function supabaseRequest(
      path: string,
      options: RequestInit = {}
    ): Promise<Response> {
      return fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: {
          apikey: supabaseSecretKey,
          Authorization: `Bearer ${supabaseSecretKey}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      })
    }

    // Get the current live model catalog from Perplexity.
    const perplexityResponse = await fetch(
      'https://api.perplexity.ai/v1/models',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${perplexityKey}`,
          Accept: 'application/json',
        },
      }
    )

    const perplexityText = await perplexityResponse.text()

    if (!perplexityResponse.ok) {
      return Response.json(
        {
          success: false,
          error: 'Could not retrieve Perplexity models.',
          status: perplexityResponse.status,
          details: perplexityText,
        },
        { status: 502 }
      )
    }

    const perplexityResult = JSON.parse(perplexityText)

    const liveModels: PerplexityModel[] =
      perplexityResult.data || []

    if (liveModels.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'Perplexity returned no models.',
        },
        { status: 502 }
      )
    }

    // Temporarily disable the existing Perplexity-powered catalog.
    // Models returned below will be re-enabled through the upsert.
    const disableResponse = await supabaseRequest(
      'ai_models?api_provider=eq.Perplexity',
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          enabled: false,
        }),
      }
    )

    if (!disableResponse.ok) {
      throw new Error(
        `Could not disable the old model catalog: ${await disableResponse.text()}`
      )
    }

    const syncedAt = new Date().toISOString()

    const databaseModels = liveModels.map((model) => {
      const name = createDisplayName(model.id)
      const provider = createProviderName(model.owned_by)

      return {
        name,
        provider,
        model_key: model.id,
        description: `${name} provided through the Perplexity Agent API.`,
        enabled: true,
        api_provider: 'Perplexity',
        input_price: model.pricing?.input ?? 0,
        output_price: model.pricing?.output ?? 0,
        cache_write_price:
          model.pricing?.cache_write ?? 0,
        cache_read_price:
          model.pricing?.cache_read ?? 0,
        pricing_unit:
          model.pricing?.unit ?? 'usd_per_1m_tokens',
        last_synced_at: syncedAt,
      }
    })

    // Insert new models and update existing models by model_key.
    const upsertResponse = await supabaseRequest(
      'ai_models?on_conflict=model_key&select=id,model_key',
      {
        method: 'POST',
        headers: {
          Prefer:
            'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(databaseModels),
      }
    )

    const upsertText = await upsertResponse.text()

    if (!upsertResponse.ok) {
      throw new Error(
        `Could not synchronize ai_models: ${upsertText}`
      )
    }

    const synchronizedModels: Array<{
      id: string
      model_key: string
    }> = JSON.parse(upsertText)

    // Find the Mega AI plan.
    const planResponse = await supabaseRequest(
      'plans?select=id&name=eq.Mega%20AI&limit=1',
      {
        method: 'GET',
      }
    )

    const planText = await planResponse.text()

    if (!planResponse.ok) {
      throw new Error(
        `Could not retrieve the Mega AI plan: ${planText}`
      )
    }

    const plans: Array<{ id: string }> =
      JSON.parse(planText)

    if (plans.length === 0) {
      throw new Error(
        'The Mega AI plan was not found in Supabase.'
      )
    }

    const megaPlanId = plans[0].id

    // Remove the old Mega AI model assignments.
    const deleteMappingsResponse = await supabaseRequest(
      `plan_models?plan_id=eq.${megaPlanId}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      }
    )

    if (!deleteMappingsResponse.ok) {
      throw new Error(
        `Could not clear old Mega AI mappings: ${await deleteMappingsResponse.text()}`
      )
    }

    const modelMappings = synchronizedModels.map(
      (model) => ({
        plan_id: megaPlanId,
        model_id: model.id,
      })
    )

    // Connect every currently available model to Mega AI.
    const mappingResponse = await supabaseRequest(
      'plan_models?on_conflict=plan_id,model_id',
      {
        method: 'POST',
        headers: {
          Prefer:
            'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(modelMappings),
      }
    )

    if (!mappingResponse.ok) {
      throw new Error(
        `Could not assign models to Mega AI: ${await mappingResponse.text()}`
      )
    }

    return Response.json(
      {
        success: true,
        message: 'Perplexity model synchronization completed.',
        modelsReceived: liveModels.length,
        modelsSynchronized: synchronizedModels.length,
        megaPlanModelsAssigned: modelMappings.length,
        synchronizedAt: syncedAt,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown synchronization error.'

    console.error('MODEL SYNC ERROR:', message)

    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    )
  }
}