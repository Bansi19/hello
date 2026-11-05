import { createConfirmedUser } from '../server/createConfirmedUser.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.' })
  }

  let body
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body
  } catch {
    return response.status(400).json({ error: 'Invalid request.' })
  }

  const result = await createConfirmedUser({
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    email: body?.email,
    password: body?.password,
    displayName: body?.displayName,
  })
  return response.status(result.status).json(result.error ? { error: result.error } : result.data)
}
