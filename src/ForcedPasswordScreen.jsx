import { useState } from 'react'
import { clearLocalSession, completeForcedPasswordChange } from './lib/monitoApi'

export default function ForcedPasswordScreen() {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password'))
    const confirmation = String(form.get('confirmation'))

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await completeForcedPasswordChange(password)
    } catch (caught) {
      if (caught.status === 401 || /session is no longer valid|authentication required/i.test(caught.message || '')) {
        await clearLocalSession()
        return
      }
      setError(caught.message || 'Could not update your password. Ask the superadmin to reset the account again.')
    } finally {
      setLoading(false)
    }
  }

  return <main className="login forced-password-page">
    <section className="login-story">
      <a className="brand" href="/"><b>m</b>monito<span>✳</span></a>
      <div className="story-content">
        <p className="eyebrow">KEEP YOUR ACCOUNT SAFE</p>
        <h1>Make it yours<br />again.</h1>
        <p className="muted">You signed in with a temporary password. Replace it before continuing to your gift exchanges.</p>
      </div>
    </section>
    <section className="login-form">
      <div>
        <span className="tag">PASSWORD RESET</span>
        <p className="eyebrow">REQUIRED BEFORE CONTINUING</p>
        <h2>Create a new<br />password.</h2>
        <p className="muted">After updating it, you’ll return to login and use your new password.</p>
        <form onSubmit={submit}>
          <label htmlFor="new-password">New password</label>
          <div className="password">
            <input id="new-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 6 characters" minLength="6" maxLength="128" required autoFocus />
            <button type="button" className="text-button" onClick={() => setShowPassword(value => !value)} aria-pressed={showPassword} aria-controls="new-password confirmation">{showPassword ? 'Hide' : 'Show'}</button>
          </div>
          <label htmlFor="confirmation">Confirm new password</label>
          <input id="confirmation" name="confirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Enter it again" minLength="6" maxLength="128" required />
          {error && <p className="auth-message error" role="alert">{error}</p>}
          <button className="primary full" disabled={loading}>{loading ? 'Updating…' : 'Save new password ↗'}</button>
          <button type="button" className="auth-back" onClick={clearLocalSession}>← Back to login</button>
        </form>
      </div>
    </section>
  </main>
}
