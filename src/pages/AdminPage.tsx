import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import { useNavigate } from 'react-router-dom'

import { supabase } from '../lib/supabase'

type AdminAccount = {
  id: string
  email: string | null
  fullName: string
  credits: number
  subscriptionStatus: string
  createdAt: string
}

type AdminUsersApiResponse = {
  success: boolean
  accounts?: AdminAccount[]
  error?: string
}

const ADMIN_USERS_API_URL = '/api/admin-users'

function formatCreatedAt(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatStatus(value: string): string {
  const cleanedValue = value
    .trim()
    .replace(/[_-]+/g, ' ')

  if (!cleanedValue) {
    return 'Unknown'
  }

  return cleanedValue.replace(/\b\w/g, (letter) =>
    letter.toUpperCase()
  )
}

function Admin() {
  const navigate = useNavigate()

  const [accounts, setAccounts] = useState<
    AdminAccount[]
  >([])

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] =
    useState(false)
  const [signingOut, setSigningOut] =
    useState(false)
  const [error, setError] = useState<string | null>(
    null
  )

  const loadAccounts = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        setError(null)

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session) {
          navigate('/login', {
            replace: true,
          })
          return
        }

        const response = await fetch(
          ADMIN_USERS_API_URL,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            signal,
          }
        )

        const payload =
          (await response.json()) as AdminUsersApiResponse

        if (!response.ok || !payload.success) {
          throw new Error(
            payload.error ||
              'Could not load customer accounts.'
          )
        }

        setAccounts(payload.accounts ?? [])
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === 'AbortError'
        ) {
          return
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Could not load customer accounts.'
        )
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [navigate]
  )

  useEffect(() => {
    const controller = new AbortController()

    void loadAccounts(controller.signal)

    return () => {
      controller.abort()
    }
  }, [loadAccounts])

  async function handleRefresh(): Promise<void> {
    setRefreshing(true)
    await loadAccounts()
  }

  async function handleSignOut(): Promise<void> {
    try {
      setSigningOut(true)
      setError(null)

      const { error: signOutError } =
        await supabase.auth.signOut()

      if (signOutError) {
        throw signOutError
      }

      navigate('/login', {
        replace: true,
      })
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : 'Could not sign out.'
      )
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1f1f1d] text-[#f0ece4]">
      <header className="border-b border-[#353431] bg-[#232320]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8f8981]">
              Admin panel
            </p>

            <h1
              className="mt-2 text-3xl font-semibold"
              style={{
                fontFamily:
                  'Georgia, Cambria, Times New Roman, serif',
              }}
            >
              Customer accounts
            </h1>

            <p className="mt-2 text-sm text-[#aaa49c]">
              Read-only account list. Management
              controls will be added separately after
              approval.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void handleRefresh()
              }}
              disabled={loading || refreshing}
              className="rounded-xl border border-[#4a4843] bg-[#2b2b28] px-4 py-2.5 text-sm font-medium text-[#e8e2d9] transition hover:border-[#65615a] hover:bg-[#30302d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={() => {
                void handleSignOut()
              }}
              disabled={signingOut}
              className="rounded-xl bg-[#eee9e1] px-4 py-2.5 text-sm font-semibold text-[#272624] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {signingOut
                ? 'Signing out...'
                : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#3a3936] bg-[#242421] p-5">
            <p className="text-sm text-[#8f8981]">
              Total customers
            </p>

            <p className="mt-2 text-3xl font-semibold text-[#f0ece4]">
              {loading ? '—' : accounts.length}
            </p>
          </div>
        </div>

        {error && (
          <div
            className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/25 px-5 py-4 text-sm leading-6 text-red-200"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-[#3a3936] bg-[#242421] shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
          <div className="border-b border-[#3a3936] px-5 py-4">
            <h2 className="font-semibold text-[#eee9e1]">
              Accounts
            </h2>
          </div>

          {loading ? (
            <div className="px-5 py-14 text-center text-sm text-[#8f8981]">
              Loading customer accounts...
            </div>
          ) : accounts.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <p className="font-medium text-[#ded8cf]">
                No customer accounts found
              </p>

              <p className="mt-2 text-sm text-[#8f8981]">
                Customer accounts will appear here after
                they are created.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#3a3936] text-left">
                <thead className="bg-[#292926]">
                  <tr className="text-xs uppercase tracking-[0.08em] text-[#8f8981]">
                    <th className="px-5 py-3.5 font-medium">
                      Email
                    </th>

                    <th className="px-5 py-3.5 font-medium">
                      Name
                    </th>

                    <th className="px-5 py-3.5 font-medium">
                      Credits
                    </th>

                    <th className="px-5 py-3.5 font-medium">
                      Status
                    </th>

                    <th className="px-5 py-3.5 font-medium">
                      Created
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[#353431]">
                  {accounts.map((account) => {
                    const normalizedStatus =
                      account.subscriptionStatus
                        .trim()
                        .toLowerCase()

                    const statusIsActive =
                      normalizedStatus === 'active'

                    return (
                      <tr
                        key={account.id}
                        className="transition hover:bg-[#292926]"
                      >
                        <td className="whitespace-nowrap px-5 py-4 text-sm font-medium text-[#eee9e1]">
                          {account.email ?? 'No email'}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-[#bdb6ad]">
                          {account.fullName || '—'}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm tabular-nums text-[#ded8cf]">
                          {account.credits.toLocaleString()}
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm">
                          <span
                            className={[
                              'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium',
                              statusIsActive
                                ? 'border-emerald-800/70 bg-emerald-950/30 text-emerald-200'
                                : 'border-[#4a4843] bg-[#2d2d2a] text-[#aaa49c]',
                            ].join(' ')}
                          >
                            {formatStatus(
                              account.subscriptionStatus
                            )}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-4 text-sm text-[#8f8981]">
                          {formatCreatedAt(
                            account.createdAt
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default Admin