import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function apiDevPlugin() {
  return {
    name: 'api-dev-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/send-push') || req.url?.startsWith('/api/daily-summary')) {
          try {
            const apiFile = req.url?.startsWith('/api/daily-summary') ? './api/daily-summary.js' : './api/send-push.js'
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
              try {
                req.body = body ? JSON.parse(body) : {}
              } catch {
                req.body = {}
              }

              // Load the handler dynamically
              const { default: handler } = await import(apiFile)

              res.status = (statusCode) => {
                res.statusCode = statusCode
                return res
              }
              res.json = (data) => {
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(data))
                return res
              }

              await handler(req, res)
            })
          } catch (err) {
            console.error('[vite-api-plugin] Error:', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
          return
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
})
