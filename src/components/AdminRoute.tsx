import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { Navigate } from 'react-router-dom'

import type { Session } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'

type AdminRouteProps = {
  children: ReactNode
}

type AccessState =
  | 'loading'
  | 'authorized'
  | 'signed-out'
  | 'forbidden'
  | 'error'

function AdminRoute({ children }: AdminRouteProps) {
  const [accessState, setAccessState] =
    useState<AccessState>('loading')

  const [error, setError] = useState<string | null>(
    null
  )

  useEffect(() => {
    let mounted = true

    async function verifyAdmin(
      session: Session | null
    ): Promise<void> {
      if (!mounted) {
        return
      }

      if (!session) {
        setAccessState('signed-out')
        setError(null)
        return
      }

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!mounted) {
        return
      }

      if (profileError) {
        console.error(
          'Administrator role check failed:',
          profileError
        )

        setError(
          'Could not verify administrator access.'
        )
        setAccessState('error')
        return
      }

      setError(null)
      setAccessState(
        profile?.role === 'admin'
          ? 'authorized'
          : 'forbidden'
      )
    }

    async function checkSession(): Promise<void> {
      const {
        data,
        error: sessionError,
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (sessionError) {
        console.error(
          'Session check failed:',
          sessionError
        )

        setError('Could not verify your login session.')
        setAccessState('error')
        return
      }

      await verifyAdmin(data.session)
    }

    void checkSession()

    const { data: authListener } =
      supabase.auth.onAuthStateChange(
        (_event, nextSession) => {
          if (!mounted) {
            return
          }

          setAccessState('loading')
          void verifyAdmin(nextSession)
        }
      )

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  if (accessState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1f1f1d] text-[#f0ece4]">
        Verifying administrator access...
      </div>
    )
  }

  if (accessState === 'signed-out') {
    return <Navigate to="/login" replace />
  }

  if (accessState === 'forbidden') {
    return <Navigate to="/portal" replace />
  }

  if (accessState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1f1f1d] px-6 text-[#f0ece4]">
        <div className="w-full max-w-lg rounded-2xl border border-red-900/60 bg-red-950/20 p-6 text-center">
          <h1 className="text-lg font-semibold">
            Access verification failed
          </h1>

          <p className="mt-2 text-sm leading-6 text-red-200">
            {error ??
              'Could not verify administrator access.'}
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export default AdminRoute