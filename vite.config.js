import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createConfirmedUser } from './server/createConfirmedUser.js'
import { completeManagedReset, listManagedUsers, resetManagedUser } from './server/adminAccounts.js'

function readJson(request) {
  return new Promise((resolve, reject) => {
    let rawBody = ''
    request.on('data', chunk => { rawBody += chunk })
    request.on('end', () => {
      try { resolve(rawBody ? JSON.parse(rawBody) : {}) } catch { reject(new Error('Invalid request.')) }
    })
  })
}

function sendResult(response, result) {
  response.setHeader('Content-Type', 'application/json')
  response.statusCode = result.status
  response.end(JSON.stringify(result.error ? { error: result.error } : result.data))
}

function localAccountApis(env) {
  const configuration = request => ({
    supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    supabaseSecretKey: env.SUPABASE_SECRET_KEY,
    superadminEmails: env.SUPERADMIN_EMAILS,
    authorization: request.headers.authorization,
  })
  return {
    name: 'monito-local-account-apis',
    configureServer(server) {
      server.middlewares.use('/api/signup', (request, response, next) => {
        if (request.method !== 'POST') return next()
        readJson(request).then(async body => {
            const result = await createConfirmedUser({
              supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
              supabaseSecretKey: env.SUPABASE_SECRET_KEY,
              email: body.email,
              password: body.password,
              displayName: body.displayName,
            })
            sendResult(response, result)
        }).catch(error => sendResult(response, { status: 400, error: error.message }))
      })
      server.middlewares.use('/api/admin-users', async (request, response, next) => {
        if (request.method !== 'GET') return next()
        sendResult(response, await listManagedUsers(configuration(request)))
      })
      server.middlewares.use('/api/admin-reset-password', (request, response, next) => {
        if (request.method !== 'POST') return next()
        readJson(request)
          .then(async body => sendResult(response, await resetManagedUser({ ...configuration(request), userId: body.userId })))
          .catch(error => sendResult(response, { status: 400, error: error.message }))
      })
      server.middlewares.use('/api/complete-password-reset', (request, response, next) => {
        if (request.method !== 'POST') return next()
        readJson(request)
          .then(async body => sendResult(response, await completeManagedReset({ ...configuration(request), password: body.password })))
          .catch(error => sendResult(response, { status: 400, error: error.message }))
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), tailwindcss(), localAccountApis(env)] }
})
