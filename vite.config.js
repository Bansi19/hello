import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createConfirmedUser } from './server/createConfirmedUser.js'

function localSignupApi(env) {
  return {
    name: 'monito-local-signup-api',
    configureServer(server) {
      server.middlewares.use('/api/signup', (request, response, next) => {
        if (request.method !== 'POST') return next()
        let rawBody = ''
        request.on('data', chunk => { rawBody += chunk })
        request.on('end', async () => {
          response.setHeader('Content-Type', 'application/json')
          try {
            const body = JSON.parse(rawBody)
            const result = await createConfirmedUser({
              supabaseUrl: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
              supabaseSecretKey: env.SUPABASE_SECRET_KEY,
              email: body.email,
              password: body.password,
              displayName: body.displayName,
            })
            response.statusCode = result.status
            response.end(JSON.stringify(result.error ? { error: result.error } : result.data))
          } catch {
            response.statusCode = 400
            response.end(JSON.stringify({ error: 'Invalid request.' }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), tailwindcss(), localSignupApi(env)] }
})
