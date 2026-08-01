import {
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import {
  Navigate,
} from 'react-router-dom'

import type {
  Session,
} from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'

type ProtectedRouteProps = {
  children: ReactNode
}

function ProtectedRoute({
  children,
}: ProtectedRouteProps) {
  const [loading, setLoading] = useState(true)

  const [session, setSession] =
    useState<Session | null>(null)

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      const {
        data,
        error,
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (error) {
        console.error(
          'Session check failed:',
          error
        )
      }

      setSession(data.session)
      setLoading(false)
    }

    void checkSession()

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!mounted) {
          return
        }

        setSession(nextSession)
        setLoading(false)
      }
    )

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
      />
    )
  }

  return <>{children}</>
}

export default ProtectedRoute