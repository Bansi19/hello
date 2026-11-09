import { useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import { signIn, signUp } from './lib/monitoApi'

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add the project URL and publishable key to .env.')
      return
    }

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    const displayName = String(form.get('displayName') || '').trim()

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        const data = await signUp(email, password, displayName)
        if (!data.session) throw new Error('Your account was created but the session could not be started. Please log in.')
        onAuthenticated()
      } else {
        await signIn(email, password)
        onAuthenticated()
      }
    } catch (caught) {
      setError(caught.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
  }

  return <main className="login">
    <section className="login-story">
      <a className="brand" href="/"><b>m</b>monito<span>✳</span></a>
      <div className="story-content">
        <p className="eyebrow">FOR YOUR FAVORITE PEOPLE, NEAR OR FAR</p>
        <h1>Different places.<br />Same little<br />surprise.</h1>
        <p className="muted">Bring your circle together for a Monito / Monita gift exchange. Draw a name. Keep the secret. Make someone's day.</p>
      </div>
      <p className="eyebrow">A LITTLE MYSTERY. A LOT OF HEART. ♡</p>
    </section>
    <section className="login-form">
      <div>
        <span className="tag">LET THE GIFTING BEGIN</span>
        <p className="eyebrow">{mode === 'signup' ? 'JOIN THE CIRCLE' : 'WELCOME TO THE CIRCLE'}</p>
        <h2>{mode === 'signup' ? <>Create your<br />account.</> : <>Good to have<br />you here.</>}</h2>
        <p className="muted">{mode === 'signup' ? 'Start exchanging gifts with your favorite people.' : 'Your next favorite tradition starts here.'}</p>
        <div className="auth-switch" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Log in</button>
          <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Sign up</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && <><label htmlFor="display-name">Display name</label><input id="display-name" name="displayName" type="text" placeholder="What should friends call you?" autoComplete="name" minLength="1" maxLength="60" required /></>}
          <label htmlFor="email">Email address</label>
          <input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <div className="password">
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" minLength="6" required />
            <button type="button" className="text-button" onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} aria-controls="password">{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          {error && <p className="auth-message error" role="alert">{error}</p>}
          <button className="primary full" disabled={loading}>{loading ? 'Please wait…' : mode === 'signup' ? 'Create account ↗' : 'Log in ↗'}</button>
        </form>
      </div>
    </section>
  </main>
}
