import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

function Login() {

  const navigate = useNavigate()  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')


  async function handleLogin() {

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })


    if (error) {
      alert(error.message)
      return
    }

    navigate('/portal')

  }


  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">

      <div className="w-full max-w-md border border-white/10 rounded-2xl p-8">

        <h1 className="text-3xl font-bold text-center">
          Customer Login
        </h1>


        <input
          className="w-full mt-8 bg-white/5 border border-white/20 rounded-xl p-3"
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />


        <input
          className="w-full mt-4 bg-white/5 border border-white/20 rounded-xl p-3"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
        />


        <button
          onClick={handleLogin}
          className="w-full mt-6 bg-white text-black py-3 rounded-xl font-semibold"
        >
          Login
        </button>


      </div>

    </div>
  )
}

export default Login