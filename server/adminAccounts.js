import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

function createAdminClient(supabaseUrl, supabaseSecretKey) {
  if (!supabaseUrl || !supabaseSecretKey) return null
  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function allowedAdmins(value) {
  return new Set(String(value || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean))
}

function bearerToken(authorization) {
  const match = String(authorization || '').match(/^Bearer\s+(.+)$/i)
  return match?.[1] || ''
}

async function authenticate({ supabaseUrl, supabaseSecretKey, superadminEmails, authorization, requireAdmin = true }) {
  const admin = createAdminClient(supabaseUrl, supabaseSecretKey)
  if (!admin) return { failure: { status: 500, error: 'Account administration is not configured.' } }

  const token = bearerToken(authorization)
  if (!token) return { failure: { status: 401, error: 'Authentication required.' } }
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return { failure: { status: 401, error: 'Your session is no longer valid.' } }

  if (requireAdmin && !allowedAdmins(superadminEmails).has(String(data.user.email || '').toLowerCase())) {
    return { failure: { status: 403, error: 'Superadmin access required.' } }
  }
  return { admin, user: data.user }
}

export async function listManagedUsers(configuration) {
  const auth = await authenticate(configuration)
  if (auth.failure) return auth.failure
  const protectedEmails = allowedAdmins(configuration.superadminEmails)

  const users = []
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await auth.admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return { status: 400, error: error.message }
    users.push(...data.users)
    if (data.users.length < 200) break
  }

  return {
    status: 200,
    data: {
      users: users.map(user => ({
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.display_name || '',
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at,
        mustChangePassword: Boolean(user.app_metadata?.force_password_change),
        protectedAccount: protectedEmails.has(String(user.email || '').toLowerCase()),
      })),
    },
  }
}

export async function resetManagedUser({ userId, ...configuration }) {
  const auth = await authenticate(configuration)
  if (auth.failure) return auth.failure
  if (!/^[0-9a-f-]{36}$/i.test(String(userId || ''))) return { status: 400, error: 'Select a valid user.' }

  const { data: targetData, error: targetError } = await auth.admin.auth.admin.getUserById(userId)
  if (targetError || !targetData.user) return { status: 404, error: 'User not found.' }
  if (allowedAdmins(configuration.superadminEmails).has(String(targetData.user.email || '').toLowerCase())) {
    return { status: 400, error: 'A superadmin account cannot be reset from this panel.' }
  }

  const temporaryPassword = `Monito-${randomBytes(8).toString('hex')}`
  const appMetadata = { ...targetData.user.app_metadata, force_password_change: true }
  const { error } = await auth.admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword,
    app_metadata: appMetadata,
  })
  if (error) return { status: 400, error: error.message }

  return { status: 200, data: { email: targetData.user.email, temporaryPassword } }
}

export async function completeManagedReset({ password, ...configuration }) {
  const auth = await authenticate({ ...configuration, requireAdmin: false })
  if (auth.failure) return auth.failure
  const normalizedPassword = String(password || '')
  if (normalizedPassword.length < 6 || normalizedPassword.length > 128) {
    return { status: 400, error: 'Password must be between 6 and 128 characters.' }
  }
  if (!auth.user.app_metadata?.force_password_change) {
    return { status: 400, error: 'This account does not have a pending password reset.' }
  }

  // Supabase merges app_metadata updates. Explicitly write false; omitting the
  // property would leave the previous true value in place and cause a loop.
  const appMetadata = { ...auth.user.app_metadata, force_password_change: false }
  const { error } = await auth.admin.auth.admin.updateUserById(auth.user.id, {
    password: normalizedPassword,
    app_metadata: appMetadata,
  })
  if (error) return { status: 400, error: error.message }
  return { status: 200, data: { updated: true } }
}
