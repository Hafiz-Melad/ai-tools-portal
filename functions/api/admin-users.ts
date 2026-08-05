import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type CustomerProfile = {
  id: string
  full_name: string | null
  credits: number | null
  subscription_status: string | null
}

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-tools-portal-9h5.pages.dev',
]

const AUTH_USERS_PAGE_SIZE = 1000
const MAX_AUTH_USER_PAGES = 100

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

function getCorsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin')

  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : 'https://ai-tools-portal-9h5.pages.dev'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200
): Response {
  return Response.json(body, {
    status,
    headers: getCorsHeaders(request),
  })
}

export async function onRequestOptions(
  context: FunctionContext
): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  })
}

export async function onRequestGet(
  context: FunctionContext
): Promise<Response> {
  try {
    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

    const authorizationHeader =
      context.request.headers.get('Authorization')

    if (
      !authorizationHeader ||
      !authorizationHeader.startsWith('Bearer ')
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Authentication is required.',
        },
        401
      )
    }

    const accessToken = authorizationHeader
      .slice('Bearer '.length)
      .trim()

    if (!accessToken) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Invalid authentication token.',
        },
        401
      )
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(accessToken)

    if (userError || !user) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Your login session is invalid or has expired.',
        },
        401
      )
    }

    const {
      data: adminProfile,
      error: adminProfileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle()

    if (adminProfileError) {
      throw new Error(
        `Could not verify administrator access: ${adminProfileError.message}`
      )
    }

    if (!adminProfile || adminProfile.role !== 'admin') {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Administrator access is required.',
        },
        403
      )
    }

    const {
      data: customerProfiles,
      error: customerProfilesError,
    } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        full_name,
        credits,
        subscription_status
      `)
      .eq('role', 'customer')

    if (customerProfilesError) {
      throw new Error(
        `Could not load customer profiles: ${customerProfilesError.message}`
      )
    }

    const profiles =
      (customerProfiles ?? []) as CustomerProfile[]

    const authUsersById = new Map<
      string,
      {
        email: string | null
        createdAt: string
      }
    >()

    for (
      let page = 1;
      page <= MAX_AUTH_USER_PAGES;
      page += 1
    ) {
      const {
        data: authUsersPage,
        error: authUsersError,
      } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: AUTH_USERS_PAGE_SIZE,
      })

      if (authUsersError) {
        throw new Error(
          `Could not load authentication accounts: ${authUsersError.message}`
        )
      }

      for (const authUser of authUsersPage.users) {
        authUsersById.set(authUser.id, {
          email: authUser.email ?? null,
          createdAt: authUser.created_at,
        })
      }

      if (
        authUsersPage.users.length <
        AUTH_USERS_PAGE_SIZE
      ) {
        break
      }
    }

    const accounts = profiles
      .map((profile) => {
        const authUser = authUsersById.get(profile.id)

        return {
          id: profile.id,
          email: authUser?.email ?? null,
          fullName: profile.full_name ?? '',
          credits:
            typeof profile.credits === 'number'
              ? profile.credits
              : 0,
          subscriptionStatus:
            profile.subscription_status ?? 'unknown',
          createdAt: authUser?.createdAt ?? '',
        }
      })
      .sort((firstAccount, secondAccount) => {
        const firstCreatedAt = Date.parse(
          firstAccount.createdAt
        )
        const secondCreatedAt = Date.parse(
          secondAccount.createdAt
        )

        if (
          Number.isNaN(firstCreatedAt) ||
          Number.isNaN(secondCreatedAt)
        ) {
          return (firstAccount.email ?? '').localeCompare(
            secondAccount.email ?? ''
          )
        }

        return secondCreatedAt - firstCreatedAt
      })

    return jsonResponse(context.request, {
      success: true,
      accounts,
    })
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown server error occurred.'

    console.error('ADMIN USERS API ERROR:', message)

    return jsonResponse(
      context.request,
      {
        success: false,
        error: message,
      },
      500
    )
  }
}