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

type PerplexityModelsResponse = {
  object?: string
  data?: PerplexityModel[]
}

type SyncedModel = {
  id: string
  model_key: string
}

type PlanResult = {
  id: string
}

function requireEnv(
  value: string | undefined,
  variableName: string
): string {
  const cleanedValue = value?.trim()

  if (!cleanedValue) {
    throw new Error(
      `${variableName} is missing from the Cloudflare environment.`
    )
  }

  return cleanedValue
}

function capitalize(value: string): string {
  if (!value) return value

  return value.charAt(0).toUpperCase() + value.slice(1)
}

function createDisplayName(modelId: string): string {
  const modelName = modelId.split('/').pop() || modelId

  // Converts names such as claude-opus-4-5 to Claude Opus 4.5.
  const claudeMatch = modelName.match(
    /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)$/i
  )

  if (claudeMatch) {
    const [, family, major, minor] = claudeMatch

    return `Claude ${capitalize(family)} ${major}.${minor}`
  }

  return modelName
    .split('-')
    .map((part) => {
      const lower = part.toLowerCase()

      if (lower === 'gpt') return 'GPT'
      if (lower === 'glm') return 'GLM'
      if (lower === 'ai') return 'AI'
      if (lower === 'xai') return 'xAI'
      if (lower === 'nvidia') return 'NVIDIA'

      return capitalize(part)
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

  if (!provider) {
    return 'Unknown'
  }

  return providers[provider.toLowerCase()] || provider
}

export async function onRequestPost(
  context: FunctionContext
): Promise<Response> {
  try {
    /*
     * These values are now guaranteed to be strings.
     * This removes the TypeScript red-line error.
     */
    const perplexityKey = requireEnv(
      context.env.PERPLEXITY_API_KEY,
      'PERPLEXITY_API_KEY'
    )

    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

    const expectedSyncSecret = requireEnv(
      context.env.MODEL_SYNC_SECRET,
      'MODEL_SYNC_SECRET'
    )

    const receivedSyncSecret =
      context.request.headers.get('x-sync-secret')?.trim()

    if (
      !receivedSyncSecret ||
      receivedSyncSecret !== expectedSyncSecret
    ) {
      return Response.json(
        {
          success: false,
          error: 'Unauthorized synchronization request.',
        },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    async function supabaseRequest(
      path: string,
      options: RequestInit = {}
    ): Promise<Response> {
      const headers = new Headers(options.headers)

      /*
       * Modern sb_secret_ keys are passed through apikey.
       * Legacy service_role keys are JWTs and can also be
       * placed in the Authorization header.
       */
      headers.set('apikey', supabaseSecretKey)
      headers.set('Accept', 'application/json')

      if (supabaseSecretKey.startsWith('sb_secret_')) {
        headers.delete('Authorization')
      } else {
        headers.set(
          'Authorization',
          `Bearer ${supabaseSecretKey}`
        )
      }

      if (options.body !== undefined && options.body !== null) {
        headers.set('Content-Type', 'application/json')
      }

      return fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers,
      })
    }

    /*
     * Retrieve the current model catalog from Perplexity.
     */
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
        {
          status: 502,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    let perplexityResult: PerplexityModelsResponse

    try {
      perplexityResult = JSON.parse(
        perplexityText
      ) as PerplexityModelsResponse
    } catch {
      throw new Error(
        'Perplexity returned an invalid JSON response.'
      )
    }

    const liveModels = Array.isArray(perplexityResult.data)
      ? perplexityResult.data
      : []

    if (liveModels.length === 0) {
      throw new Error('Perplexity returned no models.')
    }

    /*
     * Disable existing Perplexity-powered entries first.
     * Models returned by the current catalog will be
     * re-enabled during the upsert.
     */
    const disableResponse = await supabaseRequest(
      `ai_models?api_provider=eq.${encodeURIComponent(
        'Perplexity'
      )}`,
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
        description:
          `${name} provided through the Perplexity Agent API.`,
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

    /*
     * Insert new models and update existing models using
     * model_key as the unique conflict column.
     */
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

    let synchronizedModels: SyncedModel[]

    try {
      synchronizedModels = JSON.parse(
        upsertText
      ) as SyncedModel[]
    } catch {
      throw new Error(
        'Supabase returned invalid model synchronization data.'
      )
    }

    if (
      !Array.isArray(synchronizedModels) ||
      synchronizedModels.length === 0
    ) {
      throw new Error(
        'No models were synchronized with Supabase.'
      )
    }

    /*
     * Find the Mega AI plan.
     */
    const megaPlanName = encodeURIComponent('Mega AI')

    const planResponse = await supabaseRequest(
      `plans?select=id&name=eq.${megaPlanName}&limit=1`,
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

    let plans: PlanResult[]

    try {
      plans = JSON.parse(planText) as PlanResult[]
    } catch {
      throw new Error(
        'Supabase returned invalid Mega AI plan data.'
      )
    }

    if (!Array.isArray(plans) || plans.length === 0) {
      throw new Error(
        'The Mega AI plan was not found in Supabase.'
      )
    }

    const megaPlanId = plans[0].id

    /*
     * Remove previous Mega AI model assignments.
     */
    const deleteMappingsResponse = await supabaseRequest(
      `plan_models?plan_id=eq.${encodeURIComponent(
        megaPlanId
      )}`,
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

    const modelMappings = synchronizedModels.map((model) => ({
      plan_id: megaPlanId,
      model_id: model.id,
    }))

    /*
     * Assign every currently available Perplexity model
     * to the Mega AI plan.
     */
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
        message:
          'Perplexity model synchronization completed.',
        modelsReceived: liveModels.length,
        modelsSynchronized: synchronizedModels.length,
        megaPlanModelsAssigned: modelMappings.length,
        synchronizedAt: syncedAt,
      },
      {
        status: 200,
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
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }
}