const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
})

const encoder = new TextEncoder()
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const fromB64url = (value) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)), c => c.charCodeAt(0))
const randomId = () => crypto.randomUUID()

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}
async function issueToken(payload, secret) {
  const body = b64url(encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${b64url(signature)}`
}
async function readToken(token, secret) {
  const [body, signature] = String(token || '').split('.')
  if (!body || !signature) return null
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(signature), encoder.encode(body))
  if (!valid) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)))
    return payload.exp > Math.floor(Date.now() / 1000) ? payload : null
  } catch { return null }
}

async function hashPassword(password, saltBytes = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 150000 }, key, 256)
  return `pbkdf2$150000$${b64url(saltBytes)}$${b64url(bits)}`
}
async function verifyPassword(password, stored) {
  const [kind, rounds, salt, expected] = String(stored || '').split('$')
  if (kind !== 'pbkdf2' || Number(rounds) !== 150000 || !salt || !expected) return false
  const calculated = await hashPassword(password, fromB64url(salt))
  return calculated === stored
}

async function readBody(request) {
  try { return await request.json() } catch { return {} }
}
function bearer(request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
}
function cleanUser(row) {
  return { id: row.id, name: row.name, username: row.username, group_name: row.group_name, status: row.status, created_at: row.created_at }
}

export async function onRequest({ request, env, params }) {
  try {
    if (!env.DB) return json({ success: false, error: 'D1 veritabanı DB adıyla bağlanmamış.' }, 503)
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) return json({ success: false, error: 'ADMIN_USERNAME ve ADMIN_PASSWORD Pages ortam değişkenleri tanımlanmamış.' }, 503)
    const path = `/api/${Array.isArray(params.path) ? params.path.join('/') : params.path || ''}`.replace(/\/$/, '')
    const method = request.method.toUpperCase()

    if (path === '/api/health' && method === 'GET') {
      return json({ success: true, status: 'online', service: 'Mehmet IPA API', version: '1.1.0' })
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readBody(request)
      const username = String(body.username || '').trim()
      const normalizedUsername = username.toLowerCase()
      const password = String(body.password || '')
      if (!username || !password) return json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' }, 400)

      if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
        const token = await issueToken({ sub: 'admin', role: 'admin', name: 'Yönetici', username }, env.ADMIN_PASSWORD)
        return json({ success: true, token, user: { id: 'admin', name: 'Yönetici', username, role: 'admin' } })
      }

      const row = await env.DB.prepare('SELECT id, name, username, password_hash, group_name, status FROM users WHERE username = ? LIMIT 1').bind(normalizedUsername).first()
      if (!row || row.status !== 'active' || !(await verifyPassword(password, row.password_hash))) {
        return json({ success: false, error: 'Giriş bilgileri hatalı veya hesap engellenmiş.' }, 401)
      }
      const token = await issueToken({ sub: row.id, role: 'member', name: row.name, username: row.username }, env.ADMIN_PASSWORD)
      return json({ success: true, token, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum geçersiz veya süresi dolmuş.' }, 401)
      if (session.role === 'admin') return json({ success: true, user: { id: 'admin', name: 'Yönetici', username: session.username, role: 'admin' } })
      const row = await env.DB.prepare('SELECT id, name, username, group_name, status, created_at FROM users WHERE id = ?').bind(session.sub).first()
      if (!row || row.status !== 'active') return json({ success: false, error: 'Hesap etkin değil.' }, 401)
      return json({ success: true, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401)
      const isAdmin = session.role === 'admin'
      const requireAdmin = () => isAdmin ? null : json({ success: false, error: 'Bu işlem yalnızca yöneticiye açık.' }, 403)

      if (path === '/api/admin/users' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        const { results = [] } = await env.DB.prepare('SELECT id, name, username, group_name, status, created_at FROM users ORDER BY created_at DESC').all()
        return json({ success: true, users: results.map(cleanUser) })
      }
      if (path === '/api/admin/users' && method === 'POST') {
        const denied = requireAdmin(); if (denied) return denied
        const body = await readBody(request)
        const name = String(body.name || '').trim().slice(0, 80)
        const username = String(body.username || '').trim()
      const normalizedUsername = username.toLowerCase().toLowerCase().slice(0, 40)
        const password = String(body.password || '')
        const group = String(body.group_name || 'Standart').trim().slice(0, 40) || 'Standart'
        if (!name || !/^[a-z0-9._-]{3,40}$/.test(username) || password.length < 8) {
          return json({ success: false, error: 'Ad gerekli; kullanıcı adı 3-40 karakter (a-z, 0-9, . _ -), şifre en az 8 karakter olmalı.' }, 400)
        }
        const hash = await hashPassword(password)
        const id = randomId()
        try {
          await env.DB.prepare('INSERT INTO users (id, name, username, password_hash, group_name, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .bind(id, name, username, hash, group, 'active', new Date().toISOString()).run()
        } catch (error) {
          return json({ success: false, error: 'Bu kullanıcı adı kullanılıyor veya kayıt oluşturulamadı.' }, 409)
        }
        return json({ success: true, user: { id, name, username, group_name: group, status: 'active' } }, 201)
      }

      const userMatch = path.match(/^\/api\/admin\/users\/([^/]+)$/)
      if (userMatch && method === 'PATCH') {
        const denied = requireAdmin(); if (denied) return denied
        const body = await readBody(request)
        const status = body.status === 'blocked' ? 'blocked' : body.status === 'active' ? 'active' : null
        const group = body.group_name === undefined ? null : String(body.group_name).trim().slice(0, 40)
        if (status) await env.DB.prepare('UPDATE users SET status = ? WHERE id = ?').bind(status, userMatch[1]).run()
        if (group !== null) await env.DB.prepare('UPDATE users SET group_name = ? WHERE id = ?').bind(group, userMatch[1]).run()
        return json({ success: true })
      }
      if (userMatch && method === 'DELETE') {
        const denied = requireAdmin(); if (denied) return denied
        await env.DB.prepare('DELETE FROM devices WHERE user_id = ?').bind(userMatch[1]).run()
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userMatch[1]).run()
        return json({ success: true })
      }

      if (path === '/api/admin/devices' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        const { results = [] } = await env.DB.prepare('SELECT devices.id, devices.user_id, devices.udid, devices.status, devices.created_at, users.name, users.username FROM devices LEFT JOIN users ON users.id = devices.user_id ORDER BY devices.created_at DESC').all()
        return json({ success: true, devices: results })
      }
      const deviceMatch = path.match(/^\/api\/(admin\/)?devices\/([^/]+)$/)
      if (deviceMatch && method === 'PATCH') {
        if (!isAdmin || !deviceMatch[1]) return requireAdmin() || json({ success: false, error: 'Yetkisiz işlem.' }, 403)
        const body = await readBody(request)
        const status = ['pending', 'approved', 'blocked'].includes(body.status) ? body.status : null
        if (!status) return json({ success: false, error: 'Geçersiz cihaz durumu.' }, 400)
        await env.DB.prepare('UPDATE devices SET status = ? WHERE id = ?').bind(status, deviceMatch[2]).run()
        return json({ success: true })
      }

      if (path === '/api/devices' && method === 'GET') {
        if (isAdmin) return json({ success: true, devices: [] })
        const { results = [] } = await env.DB.prepare('SELECT id, udid, status, created_at FROM devices WHERE user_id = ? ORDER BY created_at DESC').bind(session.sub).all()
        return json({ success: true, devices: results })
      }
      if (path === '/api/devices' && method === 'POST') {
        if (isAdmin) return json({ success: false, error: 'Yönetici cihaz kaydı yapamaz.' }, 400)
        const body = await readBody(request)
        const udid = String(body.udid || '').trim().toUpperCase()
        if (!/^[A-F0-9-]{20,40}$/.test(udid)) return json({ success: false, error: 'UDID biçimi geçerli görünmüyor.' }, 400)
        const existing = await env.DB.prepare('SELECT id FROM devices WHERE user_id = ? AND udid = ?').bind(session.sub, udid).first()
        if (existing) return json({ success: false, error: 'Bu cihaz zaten kayıtlı.' }, 409)
        await env.DB.prepare('INSERT INTO devices (id, user_id, udid, status, created_at) VALUES (?, ?, ?, ?, ?)')
          .bind(randomId(), session.sub, udid, 'pending', new Date().toISOString()).run()
        return json({ success: true, status: 'pending' }, 201)
      }
    }

    return json({ success: false, error: 'Bulunamadı.' }, 404)
  } catch (error) {
    return json({ success: false, error: 'Sunucu hatası. D1 şemasını ve Pages bağlarını kontrol edin.' }, 500)
  }
}
