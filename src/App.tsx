import {
  BrowserRouter,
  Routes,
  Route,
} from 'react-router-dom'

import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Tools from './components/Tools'
import Services from './components/Services'
import Marketplaces from './components/Marketplaces'
import Plans from './components/Plans'
import HowItWorks from './components/HowItWorks'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

import Login from './pages/Login'
import Portal from './pages/Portal'
import Chat from './pages/Chat'
import Admin from './pages/AdminPage'

function Home() {
  return (
    <div className="min-h-screen bg-[#040b16] text-white">
      <Navbar />
      <Hero />
      <Tools />
      <Services />
      <Marketplaces />
      <Plans />
      <HowItWorks />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/login" element={<Login />} />

        <Route
          path="/portal"
          element={
            <ProtectedRoute>
              <Portal />
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat/:modelId"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <Admin />
            </AdminRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
