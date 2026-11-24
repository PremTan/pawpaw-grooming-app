// scripts/generate-seo.cjs
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const lifecycle = process.env.npm_lifecycle_event || ''
const mode = process.env.MODE || process.env.NODE_ENV || (lifecycle.includes('build') ? 'production' : 'development')

const envFiles = [
  '.env',
  '.env.local',
  `.env.${mode}`,
  `.env.${mode}.local`,
]

function loadDotEnv() {
  for (const envFile of envFiles) {
    const envPath = path.join(root, envFile)
    if (!fs.existsSync(envPath)) continue
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const index = trimmed.indexOf('=')
      const key = trimmed.slice(0, index).trim()
      const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
      process.env[key] = value
    }
  }
}

loadDotEnv()

const publicDir = path.join(root, 'public')
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true })
}

const isProduction = mode === 'production' || lifecycle.includes('build')
const rawAppUrl = process.env.APP_URL || (isProduction ? 'https://pawpawpetgrooming.in' : 'http://localhost:5173')
const appUrl = rawAppUrl.replace(/\/+$/, '')

if (isProduction) {
  // 1. Production robots.txt (allows public pages, blocks admin/internal, links sitemap)
  const robotsTxt = `# Paw Paw Pet Grooming & Boarding - Production robots.txt
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /walker/
Disallow: /walker
Disallow: /api/

Sitemap: ${appUrl}/sitemap.xml
`
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), robotsTxt, 'utf8')

  // 2. Production sitemap.xml
  const today = new Date().toISOString().slice(0, 10)
  const routes = [
    { path: '/', priority: '1.0', changefreq: 'daily' },
    { path: '/services', priority: '0.9', changefreq: 'weekly' },
    { path: '/book', priority: '0.9', changefreq: 'weekly' },
    { path: '/book-walking', priority: '0.9', changefreq: 'weekly' },
    { path: '/book-boarding', priority: '0.9', changefreq: 'weekly' },
    { path: '/gallery', priority: '0.7', changefreq: 'weekly' },
    { path: '/reviews', priority: '0.7', changefreq: 'daily' },
    { path: '/team', priority: '0.6', changefreq: 'monthly' },
  ]

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) => `  <url>
    <loc>${appUrl}${r.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`
  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8')
  console.log(`[SEO] Production robots.txt and sitemap.xml generated for ${appUrl}`)
} else {
  // Development robots.txt: Tell search engine crawlers to NEVER index development
  const devRobotsTxt = `# Paw Paw Pet Grooming - Development Environment (Do NOT index)
User-agent: *
Disallow: /
`
  fs.writeFileSync(path.join(publicDir, 'robots.txt'), devRobotsTxt, 'utf8')
  console.log(`[SEO] Development robots.txt generated (Disallow: / to prevent indexing dev)`)
}
