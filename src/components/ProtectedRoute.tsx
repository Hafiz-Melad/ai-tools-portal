import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function ProtectedRoute({ children }: { children: React.ReactNode }) {

  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)


  useEffect(() => {

    async function checkSession() {

      const {
        data: { session }
      } = await supabase.auth.getSession()

      setSession(session)
      setLoading(false)

    }

    checkSession()

  }, [])


  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        Loading...
      </div>
    )
  }


  if (!session) {
    return <Navigate to="/login" />
  }


  return children
}

export default ProtectedRoute