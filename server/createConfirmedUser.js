import { createClient } from '@supabase/supabase-js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function createConfirmedUser({ supabaseUrl, supabaseSecretKey, email, password, displayName }) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedPassword = String(password || '')
  const normalizedDisplayName = String(displayName || '').trim()

  if (!supabaseUrl || !supabaseSecretKey) return { status: 500, error: 'Account creation is not configured. Add SUPABASE_SECRET_KEY to the server environment.' }
  if (!emailPattern.test(normalizedEmail)) return { status: 400, error: 'Enter a valid email address.' }
  if (normalizedPassword.length < 6 || normalizedPassword.length > 128) return { status: 400, error: 'Password must be between 6 and 128 characters.' }
  if (normalizedDisplayName.length < 1 || normalizedDisplayName.length > 60) return { status: 400, error: 'Display name must be between 1 and 60 characters.' }

  const admin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: normalizedPassword,
    email_confirm: true,
    user_metadata: { display_name: normalizedDisplayName },
  })

  if (error) {
    const alreadyExists = /already|registered|exists/i.test(error.message)
    return {
      status: alreadyExists ? 409 : 400,
      error: alreadyExists ? 'An account with this email already exists.' : error.message,
    }
  }
  return { status: 201, data: { created: true } }
}
