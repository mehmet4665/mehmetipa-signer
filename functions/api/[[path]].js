const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
  },
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
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations: 100000 }, key, 256)
  return `pbkdf2$100000$${b64url(saltBytes)}$${b64url(bits)}`
}
async function verifyPassword(password, stored) {
  const [kind, rounds, salt, expected] = String(stored || '').split('$')
  if (kind !== 'pbkdf2' || Number(rounds) !== 100000 || !salt || !expected) return false
  const calculated = await hashPassword(password, fromB64url(salt))
  return calculated === stored
}

async function sha256Hex(value) { const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value))); return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('') }
function randomToken() { return b64url(crypto.getRandomValues(new Uint8Array(32))) }
async function sendMail(env, { to, subject, html }) { if (!env.RESEND_API_KEY || !env.MAIL_FROM) return false; const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html }) }); if (!response.ok) throw new Error('E-posta gönderimi başarısız.'); return true }
async function clearRateLimit(env, request, action) { const ip=request.headers.get('cf-connecting-ip')||'unknown'; const key=await sha256Hex(action+':'+ip); await env.DB.prepare('DELETE FROM auth_rate_limits WHERE rate_key=?').bind(key).run() }
async function rateLimit(env, request, action, limit = 6, windowMinutes = 15) { const ip = request.headers.get('cf-connecting-ip') || 'unknown'; const key = await sha256Hex(action + ':' + ip); const now = Date.now(); const row = await env.DB.prepare('SELECT attempts, window_started_at, blocked_until FROM auth_rate_limits WHERE rate_key = ?').bind(key).first(); if (row && row.blocked_until && new Date(row.blocked_until).getTime() > now) return false; const expired = !row || now - new Date(row.window_started_at).getTime() > windowMinutes * 60000; const attempts = expired ? 1 : Number(row.attempts || 0) + 1; const started = expired ? new Date(now).toISOString() : row.window_started_at; const blocked = attempts > limit ? new Date(now + windowMinutes * 60000).toISOString() : null; await env.DB.prepare('INSERT INTO auth_rate_limits (rate_key, attempts, window_started_at, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(rate_key) DO UPDATE SET attempts=excluded.attempts, window_started_at=excluded.window_started_at, blocked_until=excluded.blocked_until').bind(key, attempts, started, blocked).run(); return !blocked }
function emailHtml(title, message, url, label) { return '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#171727"><h2>' + title + '</h2><p style="line-height:1.7">' + message + '</p><p style="margin:28px 0"><a href="' + url + '" style="background:#7047d8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;display:inline-block">' + label + '</a></p><p style="color:#777;font-size:12px">Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.</p></div>' }
async function readBody(request) {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

async function encryptSecret(value, secret) {
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(value)
  )
  return { ciphertext: b64url(ciphertext), iv: b64url(iv) }
}
function bearer(request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
}
function cleanUser(row) {
  return { id: row.id, name: row.name, username: row.username, email: row.email || null, group_name: row.group_name, status: row.status, created_at: row.created_at }
}

export async function onRequest({ request, env, params }) {
  try {
    if (request.method.toUpperCase() === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'Content-Type, Authorization',
      'access-control-max-age': '86400',
    } })
    if (!env.DB) return json({ success: false, error: 'D1 veritabanı DB adıyla bağlanmamış.' }, 503)
    
    const path = `/api/${Array.isArray(params.path) ? params.path.join('/') : params.path || ''}`.replace(/\/$/, '')
    const method = request.method.toUpperCase()

    if (path === '/api/health' && method === 'GET') {
      return json({ success: true, status: 'online', service: 'Mehmet IPA API', version: '1.1.0' })
    }

    if (path === '/api/auth/register' && method === 'POST') {
      if (!(await rateLimit(env, request, 'register', 5, 30))) return json({ success: false, error: 'Çok fazla kayıt denemesi. Bir süre sonra tekrar dene.' }, 429)
      const body = await readBody(request); const name = String(body.name || '').trim().slice(0,80); const username = String(body.username || '').trim().toLowerCase(); const email = String(body.email || '').trim().toLowerCase(); const password = String(body.password || '')
      if (!name || !/^[a-z0-9._-]{3,40}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) return json({ success:false,error:'Ad soyad, geçerli e-posta, uygun kullanıcı adı ve en az 8 karakterli şifre gerekli.' },400)
      await env.DB.prepare("DELETE FROM registration_requests WHERE status='verification_pending' AND verification_expires_at < ?").bind(new Date().toISOString()).run()
      const existing = await env.DB.prepare('SELECT username FROM users WHERE username=? OR email=? UNION SELECT username FROM registration_requests WHERE username=? OR email=? LIMIT 1').bind(username,email,username,email).first()
      if (existing) return json({ success:false,error:'Bu kullanıcı adı veya e-posta zaten kayıtlı ya da başvuru bekliyor.' },409)
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ success:false,error:'E-posta gönderimi henüz yapılandırılmadı. Yönetici e-posta servisini etkinleştirmeli.' },503)
      const id=randomId(), verificationToken=randomToken(), tokenHash=await sha256Hex(verificationToken), now=new Date().toISOString(), expires=new Date(Date.now()+1800000).toISOString(), passwordHash=await hashPassword(password)
      await env.DB.prepare("INSERT INTO registration_requests (id,name,username,email,password_hash,status,verification_token_hash,verification_expires_at,created_at) VALUES (?,?,?,?,?,'verification_pending',?,?,?)").bind(id,name,username,email,passwordHash,tokenHash,expires,now).run()
      const verifyUrl='https://mehmetipa-signer.pages.dev/verify-email?token='+encodeURIComponent(verificationToken)
      try { await sendMail(env,{to:email,subject:'Mehmet IPA e-posta doğrulaması',html:emailHtml('E-posta adresini doğrula','Üyelik başvurunu tamamlamak için e-posta adresini doğrula. Bağlantı 30 dakika geçerlidir.',verifyUrl,'E-postamı doğrula')}) } catch { await env.DB.prepare('DELETE FROM registration_requests WHERE id=?').bind(id).run(); return json({success:false,error:'Doğrulama e-postası gönderilemedi.'},502) }
      return json({success:true,message:'Doğrulama bağlantısı e-posta adresine gönderildi.'},201)
    }
    if (path === '/api/auth/verify-email' && method === 'POST') {
      const body=await readBody(request), hash=await sha256Hex(String(body.token||'')); const row=await env.DB.prepare("SELECT id,status,verification_expires_at FROM registration_requests WHERE verification_token_hash=? LIMIT 1").bind(hash).first()
      if(!row || row.status!=='verification_pending' || !row.verification_expires_at || new Date(row.verification_expires_at).getTime()<Date.now()) return json({success:false,error:'Doğrulama bağlantısı geçersiz veya süresi dolmuş.'},400)
      await env.DB.prepare("UPDATE registration_requests SET status='pending',verified_at=?,verification_token_hash=NULL,verification_expires_at=NULL WHERE id=?").bind(new Date().toISOString(),row.id).run()
      if (env.ADMIN_NOTIFICATION_EMAIL && env.RESEND_API_KEY && env.MAIL_FROM) await sendMail(env,{to:env.ADMIN_NOTIFICATION_EMAIL,subject:'Mehmet IPA: yeni üyelik başvurusu',html:emailHtml('Yeni üyelik başvurusu',row.username+' kullanıcısının başvurusu yönetici onayını bekliyor. Yönetim panelinden inceleyebilirsin.','https://mehmetipa-signer.pages.dev','Yönetim panelini aç')}).catch(()=>{})
      return json({success:true,message:'E-posta doğrulandı. Başvurun yönetici onayına gönderildi.'})
    }
    if (path === '/api/auth/forgot-password' && method === 'POST') {
      if (!env.RESEND_API_KEY || !env.MAIL_FROM) return json({ success:false,error:'Şifre sıfırlama e-postası henüz yapılandırılmadı.' },503)
      if (!(await rateLimit(env,request,'forgot-password',4,30))) return json({success:false,error:'Çok fazla deneme. Daha sonra tekrar dene.'},429)
      const body=await readBody(request), email=String(body.email||'').trim().toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({success:false,error:'Geçerli e-posta adresi gir.'},400)
      const row=await env.DB.prepare("SELECT id,email FROM users WHERE email=? AND status='active' LIMIT 1").bind(email).first()
      if(row && env.RESEND_API_KEY && env.MAIL_FROM) { const token=randomToken(), tokenHash=await sha256Hex(token), id=randomId(), expires=new Date(Date.now()+1800000).toISOString(); await env.DB.prepare('INSERT INTO password_reset_tokens (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)').bind(id,row.id,tokenHash,expires,new Date().toISOString()).run(); const url='https://mehmetipa-signer.pages.dev/reset-password?token='+encodeURIComponent(token); try { await sendMail(env,{to:email,subject:'Mehmet IPA şifre sıfırlama',html:emailHtml('Şifreni yenile','Şifre sıfırlama bağlantısı 30 dakika geçerlidir ve tek kullanımlıktır.',url,'Şifremi yenile')}) } catch { return json({success:false,error:'E-posta gönderilemedi. Daha sonra tekrar dene.'},502) } }
      return json({success:true,message:'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı gönderildi.'})
    }
    if (path === '/api/auth/reset-password' && method === 'POST') {
      if (!(await rateLimit(env,request,'reset-password',6,30))) return json({success:false,error:'Çok fazla deneme. Daha sonra tekrar dene.'},429)
      const body=await readBody(request), hash=await sha256Hex(String(body.token||'')), password=String(body.password||''); if(password.length<8||password.length>128) return json({success:false,error:'Şifre 8-128 karakter olmalı.'},400)
      const row=await env.DB.prepare('SELECT id,user_id,expires_at,used_at FROM password_reset_tokens WHERE token_hash=? LIMIT 1').bind(hash).first(); if(!row||row.used_at||new Date(row.expires_at).getTime()<Date.now()) return json({success:false,error:'Bağlantı geçersiz, kullanılmış veya süresi dolmuş.'},400)
      const passwordHash=await hashPassword(password), now=new Date().toISOString(); await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(passwordHash,row.user_id),env.DB.prepare('UPDATE password_reset_tokens SET used_at=? WHERE id=?').bind(now,row.id),env.DB.prepare('UPDATE password_reset_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').bind(now,row.user_id)]); return json({success:true,message:'Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.'})
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readBody(request)
      const username = String(body.username || '').trim()
      const password = String(body.password || '')
      if (!(await rateLimit(env, request, 'login', 10, 15))) return json({ success: false, error: 'Çok fazla giriş denemesi. 15 dakika sonra tekrar dene.' }, 429)
      if (!username || !password) return json({ success: false, error: 'Kullanıcı adı ve şifre gerekli.' }, 400)

      if (username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
        await clearRateLimit(env, request, 'login')
        const token = await issueToken({ sub: 'admin', role: 'admin', name: 'Yönetici', username }, env.ADMIN_PASSWORD)
        return json({ success: true, token, user: { id: 'admin', name: 'Yönetici', username, role: 'admin' } })
      }

      const row = await env.DB.prepare('SELECT id, name, username, password_hash, group_name, status FROM users WHERE username = ? LIMIT 1').bind(username.toLowerCase()).first()
      if (!row || row.status !== 'active' || !(await verifyPassword(password, row.password_hash))) {
        return json({ success: false, error: 'Giriş bilgileri hatalı veya hesap engellenmiş.' }, 401)
      }
      await clearRateLimit(env, request, 'login')
      const token = await issueToken({ sub: row.id, role: 'member', name: row.name, username: row.username }, env.ADMIN_PASSWORD)
      return json({ success: true, token, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum geçersiz veya süresi dolmuş.' }, 401)
      if (session.role === 'admin') return json({ success: true, user: { id: 'admin', name: 'Yönetici', username: session.username, role: 'admin' } })
      const row = await env.DB.prepare('SELECT id, name, username, email, group_name, status, created_at FROM users WHERE id = ?').bind(session.sub).first()
      if (!row || row.status !== 'active') return json({ success: false, error: 'Hesap etkin değil.' }, 401)
      return json({ success: true, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401)
      const isAdmin = session.role === 'admin'
      if (!isAdmin) { const activeUser = await env.DB.prepare("SELECT status FROM users WHERE id=? LIMIT 1").bind(session.sub).first(); if (!activeUser || activeUser.status !== 'active') return json({ success:false,error:'Hesabın devre dışı. Yöneticiyle iletişime geç.' },403) }
      const requireAdmin = () => isAdmin ? null : json({ success: false, error: 'Bu işlem yalnızca yöneticiye açık.' }, 403)

      if (path === '/api/admin/registration-requests' && method === 'GET') {
        const denied=requireAdmin(); if(denied) return denied
        const {results=[]}=await env.DB.prepare("SELECT id,name,username,email,status,created_at,verified_at FROM registration_requests WHERE status IN ('pending','verification_pending','rejected') ORDER BY created_at DESC").all()
        return json({success:true,requests:results})
      }
      const registrationMatch=path.match(/^\/api\/admin\/registration-requests\/([^/]+)$/)
      if(registrationMatch && method==='POST') {
        const denied=requireAdmin(); if(denied) return denied; const body=await readBody(request), action=body.action
        const row=await env.DB.prepare('SELECT * FROM registration_requests WHERE id=? LIMIT 1').bind(registrationMatch[1]).first()
        if(!row || row.status!=='pending') return json({success:false,error:'Başvuru bulunamadı veya e-posta doğrulanmadı.'},404)
        if(action==='reopen' && row.status==='rejected') { await env.DB.prepare("UPDATE registration_requests SET status='pending',reviewed_at=NULL,reviewed_by=NULL WHERE id=?").bind(row.id).run(); return json({success:true}) }
        if(action==='reject') { await env.DB.prepare("UPDATE registration_requests SET status='rejected',reviewed_at=?,reviewed_by='admin' WHERE id=?").bind(new Date().toISOString(),row.id).run(); if(env.RESEND_API_KEY&&env.MAIL_FROM) await sendMail(env,{to:row.email,subject:'Mehmet IPA üyelik başvurusu',html:emailHtml('Başvurun sonuçlandı','Üyelik başvurun şu anda kabul edilmedi.','https://mehmetipa-signer.pages.dev','Mehmet IPA')}).catch(()=>{}); return json({success:true}) }
        if(action!=='approve') return json({success:false,error:'Geçersiz işlem.'},400)
        const conflict=await env.DB.prepare('SELECT id FROM users WHERE username=? OR email=? LIMIT 1').bind(row.username,row.email).first(); if(conflict) return json({success:false,error:'Kullanıcı adı veya e-posta başka hesapta kullanılıyor.'},409)
        const userId=randomId(), now=new Date().toISOString()
        await env.DB.batch([env.DB.prepare("INSERT INTO users (id,name,username,email,password_hash,group_name,status,created_at,email_verified) VALUES (?,?,?,?,?,'Standart','active',?,1)").bind(userId,row.name,row.username,row.email,row.password_hash,now),env.DB.prepare("UPDATE registration_requests SET status='approved',reviewed_at=?,reviewed_by='admin' WHERE id=?").bind(now,row.id)])
        if(env.RESEND_API_KEY&&env.MAIL_FROM) await sendMail(env,{to:row.email,subject:'Mehmet IPA hesabın onaylandı',html:emailHtml('Hesabın hazır!','Üyelik başvurun onaylandı. Artık Mehmet IPA hesabına giriş yapabilirsin.','https://mehmetipa-signer.pages.dev','Giriş yap')}).catch(()=>{})
        return json({success:true,user:{id:userId,username:row.username}})
      }
      if (path === '/api/admin/users' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        const { results = [] } = await env.DB.prepare('SELECT id, name, username, email, group_name, status, created_at FROM users ORDER BY created_at DESC').all()
        return json({ success: true, users: results.map(cleanUser) })
      }
      if (path === '/api/admin/users' && method === 'POST') {
        const denied = requireAdmin(); if (denied) return denied
        const body = await readBody(request)
        const name = String(body.name || '').trim().slice(0, 80)
        const username = String(body.username || '').trim().toLowerCase().slice(0, 40)
        const password = String(body.password || '')
        const email = String(body.email || '').trim().toLowerCase()
        const group = String(body.group_name || 'Standart').trim().slice(0, 40) || 'Standart'
        if (!name || !/^[a-z0-9._-]{3,40}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
          return json({ success: false, error: 'Ad ve geçerli e-posta gerekli; kullanıcı adı 3-40 karakter (a-z, 0-9, . _ -), şifre en az 8 karakter olmalı.' }, 400)
        }
        const hash = await hashPassword(password)
        const id = randomId()
        try {
          await env.DB.prepare('INSERT INTO users (id, name, username, email, password_hash, group_name, status, created_at, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)')
            .bind(id, name, username, email, hash, group, 'active', new Date().toISOString()).run()
        } catch (error) {
          return json({ success: false, error: 'Bu kullanıcı adı kullanılıyor veya kayıt oluşturulamadı.' }, 409)
        }
        return json({ success: true, user: { id, name, username, email, group_name: group, status: 'active' } }, 201)
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
        

      // MEMBER PRESENCE: heartbeat and device/browser details derived from request headers.
      if (path === '/api/presence/heartbeat' && method === 'POST') {
        if (isAdmin) return json({ success: true })
        const ua = request.headers.get('user-agent') || ''
        const device = /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? 'Android cihaz' : /Windows/i.test(ua) ? 'Windows bilgisayar' : /Macintosh|Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux cihaz' : 'Bilinmeyen cihaz'
        const browser = /Edg\//i.test(ua) ? 'Edge' : /CriOS\//i.test(ua) ? 'Chrome (iOS)' : /FxiOS\//i.test(ua) ? 'Firefox (iOS)' : /Chrome\//i.test(ua) ? 'Chrome' : /Safari\//i.test(ua) ? 'Safari' : /Firefox\//i.test(ua) ? 'Firefox' : 'Bilinmeyen tarayıcı'
        await env.DB.prepare('UPDATE users SET last_seen_at = ?, device_label = ?, browser_label = ? WHERE id = ?')
          .bind(new Date().toISOString(), device, browser, session.sub).run()
        return json({ success: true })
      }
      if (path === '/api/admin/presence' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        const { results = [] } = await env.DB.prepare(
          'SELECT id, name, username, last_seen_at, device_label, browser_label FROM users ORDER BY last_seen_at DESC'
        ).all()
        const now = Date.now()
        return json({ success: true, users: results.map(row => ({
          ...row,
          online: !!row.last_seen_at && now - new Date(row.last_seen_at).getTime() <= 90000
        })) })
      }

      // SIGNING: VIP sertifika durumu
      if (path === '/api/signing/availability' && method === 'GET') {
        const cert = await env.DB.prepare(
          'SELECT status, certificate_name, profile_name, expires_at FROM signing_certificate ORDER BY updated_at DESC LIMIT 1'
        ).first()

        const available = !!(
          cert &&
          cert.status === 'active'
        )

        return json({
          success: true,
          available,
          certificate: cert ? {
            name: cert.certificate_name,
            profile: cert.profile_name,
            expires_at: cert.expires_at
          } : null
        })
      }

      // SIGNING: Yönetici sertifika bilgisi
      if (path === '/api/admin/certificate' && method === 'GET') {
        const denied = requireAdmin()
        if (denied) return denied

        const cert = await env.DB.prepare(
          'SELECT id, status, certificate_name, profile_name, expires_at, updated_at FROM signing_certificate ORDER BY updated_at DESC LIMIT 1'
        ).first()

        return json({ success: true, certificate: cert || null })
      }

      // SIGNING: Yönetici sertifika ve profil yükleme
      if (path === '/api/admin/certificate' && method === 'POST') {
        const denied = requireAdmin()
        if (denied) return denied

        if (!env.CERTS || !env.SIGNING_ENCRYPTION_KEY) {
          return json({ success: false, error: 'Sertifika kasası veya şifreleme anahtarı bağlı değil.' }, 503)
        }

        const body = await readBody(request)
        const certificateName = String(body.certificate_name || '').trim().slice(0, 180)
        const profileName = String(body.profile_name || '').trim().slice(0, 180)
        const password = String(body.password || '')
        const expiresAt = body.expires_at ? String(body.expires_at).slice(0, 40) : null
        const p12Base64 = String(body.p12_base64 || '')
        const profileBase64 = String(body.profile_base64 || '')

        if (!certificateName || !profileName || !password || !p12Base64 || !profileBase64) {
          return json({ success: false, error: 'P12, şifre, provisioning profile ve dosya adları gerekli.' }, 400)
        }

        if (p12Base64.length > 7000000 || profileBase64.length > 1400000) {
          return json({ success: false, error: 'Dosya boyutu sınırı aşıldı.' }, 413)
        }

        let p12Bytes, profileBytes
        try {
          const decode = (value) => {
            const normalized = value.replace(/^data:[^,]*;base64,/, '').replace(/\s/g, '')
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
              throw new Error('Geçersiz Base64')
            }
            return Uint8Array.from(atob(normalized), c => c.charCodeAt(0))
          }
          p12Bytes = decode(p12Base64)
          profileBytes = decode(profileBase64)
        } catch {
          return json({ success: false, error: 'Dosya verisi okunamadı.' }, 400)
        }

        if (!p12Bytes.length || p12Bytes.length > 5 * 1024 * 1024 ||
            !profileBytes.length || profileBytes.length > 1024 * 1024) {
          return json({ success: false, error: 'P12 en fazla 5 MB, profil en fazla 1 MB olmalı.' }, 413)
        }

        const id = randomId()
        const p12Key = `certificates/${id}/certificate.p12`
        const profileKey = `certificates/${id}/profile.mobileprovision`
        const encrypted = await encryptSecret(password, env.SIGNING_ENCRYPTION_KEY)

        try {
          await env.CERTS.put(p12Key, p12Bytes, {
            httpMetadata: { contentType: 'application/x-pkcs12' }
          })
          await env.CERTS.put(profileKey, profileBytes, {
            httpMetadata: { contentType: 'application/octet-stream' }
          })

          await env.DB.prepare(
            `INSERT INTO signing_certificate
            (id, status, certificate_name, profile_name, password_ciphertext, password_iv, p12_key, profile_key, expires_at, updated_at)
            VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, certificateName, profileName,
            encrypted.ciphertext, encrypted.iv,
            p12Key, profileKey, expiresAt,
            new Date().toISOString()
          ).run()
        } catch (error) {
          try { await env.CERTS.delete(p12Key) } catch {}
          try { await env.CERTS.delete(profileKey) } catch {}
          throw error
        }

        return json({
          success: true,
          certificate: {
            id,
            status: 'pending',
            certificate_name: certificateName,
            profile_name: profileName,
            expires_at: expiresAt
          },
          message: 'Sertifika dosyaları özel kasaya kaydedildi. Doğrulama bekleniyor.'
        }, 201)
      }

      // SIGNING: Yönetici imza geçmişi
      if (path === '/api/admin/signing-logs' && method === 'GET') {
        const denied = requireAdmin()
        if (denied) return denied

        const { results = [] } = await env.DB.prepare(
          `SELECT signing_logs.id, signing_logs.username,
           signing_logs.mode, signing_logs.ipa_name,
           signing_logs.status, signing_logs.created_at,
           users.name
           FROM signing_logs
           LEFT JOIN users ON users.id = signing_logs.user_id
           ORDER BY signing_logs.created_at DESC
           LIMIT 200`
        ).all()

        return json({ success: true, logs: results })
      }

      // SIGNING: Üye imza işlemi başlatır
      if (path === '/api/signing/log' && method === 'POST') {
        if (isAdmin) {
          return json({ success: false, error: 'Yönetici imza kaydı oluşturamaz.' }, 400)
        }

        const body = await readBody(request)
        const mode = body.mode
        const ipaName = String(body.ipa_name || '').trim().slice(0, 180)

        if (!['own', 'vip'].includes(mode) || !ipaName) {
          return json({ success: false, error: 'İmza yöntemi veya IPA adı geçersiz.' }, 400)
        }

        if (mode === 'vip') {
          const cert = await env.DB.prepare(
            "SELECT status FROM signing_certificate WHERE status = 'active' LIMIT 1"
          ).first()

          if (!cert) {
            return json({ success: false, error: 'VIP sertifika şu anda kullanıma hazır değil.' }, 409)
          }
        }

        const id = randomId()

        await env.DB.prepare(
          `INSERT INTO signing_logs
           (id, user_id, username, mode, ipa_name, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'started', ?)`
        ).bind(
          id,
          session.sub,
          session.username,
          mode,
          ipaName,
          new Date().toISOString()
        ).run()

        return json({ success: true, log_id: id }, 201)
      }

      // SIGNING: İmza sonucunu kaydet
      const signingLogMatch = path.match(/^\/api\/signing\/log\/([^/]+)$/)

      if (signingLogMatch && method === 'PATCH') {
        const body = await readBody(request)
        const status = body.status

        if (!['success', 'failed'].includes(status)) {
          return json({ success: false, error: 'Geçersiz imza durumu.' }, 400)
        }

        const log = await env.DB.prepare(
          'SELECT id, user_id FROM signing_logs WHERE id = ? LIMIT 1'
        ).bind(signingLogMatch[1]).first()

        if (!log) {
          return json({ success: false, error: 'İmza kaydı bulunamadı.' }, 404)
        }

        if (!isAdmin && log.user_id !== session.sub) {
          return json({ success: false, error: 'Bu kayıt size ait değil.' }, 403)
        }

        await env.DB.prepare(
          'UPDATE signing_logs SET status = ? WHERE id = ?'
        ).bind(status, signingLogMatch[1]).run()

        return json({ success: true })
      } 
    } 
    return json({ success: false, error: 'Bulunamadı.' }, 404)
  } catch (error) {
    return json({ success: false, error: 'Sunucu hatası. D1 şemasını ve Pages bağlarını kontrol edin.' }, 500)
  }
}
