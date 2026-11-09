import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import AuthScreen from './AuthScreen'
import Dashboard from './Dashboard'
import ForcedPasswordScreen from './ForcedPasswordScreen'
import { supabase } from './lib/supabase'
import './style.css'

function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let active = true
    if (!supabase) {
      setReady(true)
      return () => { active = false }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setReady(true)
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setReady(true)
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [])

  if (!ready) return <div className="auth-loading">Loading MONITO…</div>
  if (!session) return <AuthScreen onAuthenticated={() => {}} />
  if (session.user.app_metadata?.force_password_change) return <ForcedPasswordScreen />
  return <Dashboard />
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
