import { listManagedUsers } from '../server/adminAccounts.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Method not allowed.' })
  }
  const result = await listManagedUsers({
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    superadminEmails: process.env.SUPERADMIN_EMAILS,
    authorization: request.headers.authorization,
  })
  return response.status(result.status).json(result.error ? { error: result.error } : result.data)
}
