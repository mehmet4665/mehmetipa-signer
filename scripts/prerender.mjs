import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createServer } from 'vite'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.join(projectRoot, 'dist')
const template = await readFile(path.join(outputRoot, 'index.html'), 'utf8')

const pages = [
  {
    route: 'app',
    output: 'index.html',
    title: 'Mehmet IPA - iOS IPA İmzalama',
    description:
      'Mehmet IPA ile iOS IPA dosyalarını tarayıcıda yerel olarak imzalayın.',
    canonical: 'https://mehmetipa-signer.pages.dev/',
  },
  {
    route: 'privacy',
    output: 'privacy/index.html',
    title: 'Gizlilik Politikası - Mehmet IPA',
    description:
      'Mehmet IPA, IPA dosyalarını ve imzalama bilgilerini tarayıcınızda yerel olarak işler.',
    canonical: 'https://mehmetipa-signer.pages.dev/privacy/',
  },
  {
    route: 'legal',
    output: 'legal/index.html',
    title: 'Yasal Bilgilendirme - Mehmet IPA',
    description:
      'Mehmet IPA kullanım koşulları, lisans bilgileri ve üçüncü taraf bildirimleri.',
    canonical: 'https://mehmetipa-signer.pages.dev/legal/',
  },
]

const server = await createServer({
  root: projectRoot,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  const { render } = await server.ssrLoadModule('/src/entry-server.tsx')

  for (const page of pages) {
    const markup = render(page.route)
    let html = template
      .replace('<div id="app"></div>', `<div id="app">${markup}</div>`)
      .replace(/<title>.*?<\/title>/, `<title>${page.title}</title>`)
      .replace(
        /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
        `<meta name="description" content="${page.description}" />`,
      )
      .replace(
        /<link rel="canonical" href="[^"]*"\s*\/>/,
        `<link rel="canonical" href="${page.canonical}" />`,
      )
      .replace(
        /<meta property="og:url" content="[^"]*"\s*\/>/,
        `<meta property="og:url" content="${page.canonical}" />`,
      )
      .replace(
        /<meta property="og:title" content="[^"]*"\s*\/>/,
        `<meta property="og:title" content="${page.title}" />`,
      )
      .replace(
        /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
        `<meta property="og:description" content="${page.description}" />`,
      )
      .replace(
        /<meta name="twitter:title" content="[^"]*"\s*\/>/,
        `<meta name="twitter:title" content="${page.title}" />`,
      )
      .replace(
        /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
        `<meta name="twitter:description" content="${page.description}" />`,
      )

    if (page.route !== 'app') {
      const pageSchema = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: page.title,
        description: page.description,
        url: page.canonical,
        isPartOf: { '@id': 'https://mehmetipa-signer.pages.dev/#website' },
        author: {
          '@type': 'Person',
          name: 'Mehmet IPA',
          url: 'https://github.com/mehmet4665/mehmetipa-signer',
        },
        inLanguage: 'tr',
        dateModified: '2026-09-18',
      })
      html = html.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
        `<script type="application/ld+json">${pageSchema}</script>`,
      )
    }

    const destination = path.join(outputRoot, page.output)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, html)
  }
} finally {
  await server.close()
}
