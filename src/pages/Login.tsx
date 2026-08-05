import {
  useState,
  type FormEvent,
} from 'react'

import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function Login() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(
    null
  )

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    const cleanedEmail = email.trim()

    if (!cleanedEmail || !password) {
      setError('Enter your email and password.')
      return
    }

    try {
      setSigningIn(true)
      setError(null)

      const {
        data: signInData,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      })

      if (signInError) {
        throw signInError
      }

      let destination = '/portal'

      if (signInData.user) {
        const {
          data: profile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', signInData.user.id)
          .maybeSingle()

        if (profileError) {
          console.error(
            'Could not determine login destination:',
            profileError
          )
        } else if (profile?.role === 'admin') {
          destination = '/admin'
        }
      }

      navigate(destination, {
        replace: true,
      })
    } catch (signInError) {
      setError(
        signInError instanceof Error
          ? signInError.message
          : 'Could not sign in. Check your credentials and try again.'
      )
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#1f1f1d] px-6 text-[#f0ece4]">
      <div className="w-full max-w-md rounded-2xl border border-[#3a3936] bg-[#242421] p-8 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
        <div className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8f8981]">
            Private access
          </p>

          <h1
            className="mt-3 text-3xl font-semibold"
            style={{
              fontFamily:
                'Georgia, Cambria, Times New Roman, serif',
            }}
          >
            Customer Login
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#aaa49c]">
            Sign in using the credentials provided by your
            administrator.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-8"
        >
          <label className="block">
            <span className="text-sm font-medium text-[#d8d2c9]">
              Email
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setError(null)
              }}
              autoComplete="email"
              inputMode="email"
              required
              disabled={signingIn}
              className="mt-2 w-full rounded-xl border border-[#45433f] bg-[#2b2b28] px-4 py-3 text-[#f0ece4] outline-none transition placeholder:text-[#777169] focus:border-[#777169] disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Email"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm font-medium text-[#d8d2c9]">
              Password
            </span>

            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value)
                setError(null)
              }}
              autoComplete="current-password"
              required
              disabled={signingIn}
              className="mt-2 w-full rounded-xl border border-[#45433f] bg-[#2b2b28] px-4 py-3 text-[#f0ece4] outline-none transition placeholder:text-[#777169] focus:border-[#777169] disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Password"
            />
          </label>

          {error && (
            <div
              className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200"
              role="alert"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={
              signingIn ||
              !email.trim() ||
              !password
            }
            className="mt-6 w-full rounded-xl bg-[#eee9e1] py-3 font-semibold text-[#272624] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {signingIn
              ? 'Signing in...'
              : 'Login'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-[#777169]">
          Account registration is not available publicly.
        </p>
      </div>
    </div>
  )
}

export default Login