import forge from 'node-forge'

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
  const parts = String(stored || '').split(String.fromCharCode(36))
  const [kind, roundsText, salt, expected] = parts
  const rounds = Number(roundsText)
  if (kind !== 'pbkdf2' || ![10000, 100000].includes(rounds) || !salt || !expected) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64url(salt), iterations: rounds }, key, 256)
  return b64url(bits) === expected
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

async function encryptionKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error('SIGNING_ENCRYPTION_KEY en az 32 karakter olmalı.')
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
}
async function encryptSecret(value, secret) {
  const key = await encryptionKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  return { ciphertext: b64url(ciphertext), iv: b64url(iv) }
}
async function encryptBytes(value, secret) {
  const key = await encryptionKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, value)
  return { ciphertext: new Uint8Array(ciphertext), iv: b64url(iv) }
}
async function decryptionKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error('SIGNING_ENCRYPTION_KEY en az 32 karakter olmalı.')
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt'])
}
async function decryptSecret(value, iv, secret) {
  const key = await decryptionKey(secret)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(value))
  return new TextDecoder().decode(plaintext)
}
async function decryptBytes(value, iv, secret) {
  const key = await decryptionKey(secret)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, value)
  return new Uint8Array(plaintext)
}

function bytesToBinary(bytes) {
  let output = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    output += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return output
}

function certificateField(certificate, name) {
  const field = certificate?.subject?.getField(name) || certificate?.issuer?.getField(name)
  return typeof field?.value === 'string' ? field.value : ''
}

function validateSigningMaterials(p12Bytes, profileBytes, password) {
  let p12
  try {
    const p12Asn1 = forge.asn1.fromDer(bytesToBinary(p12Bytes))
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password)
  } catch {
    throw new Error('P12 dosyası okunamadı veya P12 şifresi yanlış.')
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const certificates = certBags.filter((bag) => bag.cert).map((bag) => bag.cert)
  const certificate = certificates.find(Boolean)
  if (!certificate) throw new Error('P12 içinde imzalama sertifikası bulunamadı.')

  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []),
  ]
  const privateKey = keyBags.find((bag) => bag.key)?.key
  if (!privateKey) throw new Error('P12 içinde özel imzalama anahtarı bulunamadı.')
  if (!certificate.publicKey?.n || !privateKey.n || !privateKey.e ||
      certificate.publicKey.n.compareTo(privateKey.n) !== 0 ||
      certificate.publicKey.e.compareTo(privateKey.e) !== 0) {
    throw new Error('P12 içindeki sertifika ile özel anahtar eşleşmiyor veya desteklenmeyen anahtar türü.')
  }

  const now = new Date()
  if (certificate.validity.notBefore > now) throw new Error('İmzalama sertifikası henüz geçerli değil.')
  if (certificate.validity.notAfter <= now) throw new Error('İmzalama sertifikasının süresi dolmuş.')
  const certificateName = certificateField(certificate, 'CN')
  const certificateIssuer = certificate.issuer?.getField('O')?.value || ''
  if (!/Apple Distribution|iPhone Distribution|Apple Development/i.test(certificateName) ||
      !/Apple Inc\./i.test(String(certificateIssuer))) {
    throw new Error('P12 sertifikası beklenen Apple dağıtım/geliştirici sertifikası biçiminde değil.')
  }

  let profileAsn1
  let profileMessage
  try {
    profileAsn1 = forge.asn1.fromDer(bytesToBinary(profileBytes))
    profileMessage = forge.pkcs7.messageFromAsn1(profileAsn1)
  } catch {
    throw new Error('Provisioning profile geçerli bir imzalı Apple CMS dosyası olarak okunamadı.')
  }
  if (profileMessage.type !== forge.pki.oids.signedData) {
    throw new Error('Provisioning profile imzalı CMS verisi değil.')
  }

  // Apple profiles are signed by Apple's iPhone OS Provisioning Profile
  // Signing certificate, chained through Apple iPhone Certification Authority
  // to the pinned Apple Root CA. node-forge parses CMS but its verify() method
  // is intentionally unimplemented, so verify the CMS signed attributes here.
  const contentInfo = profileAsn1.value
  const signedData = contentInfo?.[1]?.value?.[0]
  const signedDataFields = signedData?.value || []
  const encapContentInfo = signedDataFields.find((node) =>
    node?.tagClass === forge.asn1.Class.UNIVERSAL &&
    node?.type === forge.asn1.Type.SEQUENCE &&
    node?.value?.[0]?.type === forge.asn1.Type.OID &&
    forge.asn1.derToOid(node.value[0].value) === forge.pki.oids.data
  )
  const signerSet = signedDataFields.find((node) =>
    node?.tagClass === forge.asn1.Class.UNIVERSAL &&
    node?.type === forge.asn1.Type.SET &&
    Array.isArray(node.value) &&
    node.value.length > 0 &&
    node.value[0]?.type === forge.asn1.Type.SEQUENCE &&
    node.value[0]?.value?.[0]?.type === forge.asn1.Type.INTEGER &&
    node.value[0]?.value?.[1]?.type === forge.asn1.Type.SEQUENCE
  )
  const signerInfoAsn1 = signerSet?.value?.[0]
  if (!encapContentInfo || !signerInfoAsn1) {
    throw new Error('Provisioning profile CMS içeriği veya imzalayıcı kaydı bulunamadı.')
  }
  const eContentWrapper = encapContentInfo.value?.[1]
  const eContentNode = eContentWrapper?.value?.[0]
  if (!eContentNode || eContentNode.type !== forge.asn1.Type.OCTETSTRING) {
    throw new Error('Provisioning profile imzalı içerik alanı okunamadı.')
  }
  const eContentBytes = eContentNode.value

  const signerFields = signerInfoAsn1.value || []
  const versionNode = signerFields[0]
  const issuerAndSerialNode = signerFields[1]
  const digestAlgorithmNode = signerFields[2]
  const authenticatedAttributesNode = signerFields.find((node) =>
    node?.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && node?.type === 0 && node?.constructed
  )
  const signatureAlgorithmNode = signerFields.find((node) =>
    node?.tagClass === forge.asn1.Class.UNIVERSAL &&
    node?.type === forge.asn1.Type.SEQUENCE &&
    node?.value?.[0]?.type === forge.asn1.Type.OID &&
    forge.asn1.derToOid(node.value[0].value) === forge.pki.oids.rsaEncryption
  )
  const signatureNode = signerFields.find((node) =>
    node?.tagClass === forge.asn1.Class.UNIVERSAL && node?.type === forge.asn1.Type.OCTETSTRING
  )
  if (!versionNode || !issuerAndSerialNode || !digestAlgorithmNode ||
      !authenticatedAttributesNode || !signatureAlgorithmNode || !signatureNode) {
    throw new Error('Provisioning profile CMS imzası eksik veya desteklenmiyor.')
  }

  const signerSerialNode = issuerAndSerialNode.value?.[1]
  const signerSerial = signerSerialNode?.value
  const signerCertificate = (profileMessage.certificates || []).find((cert) =>
    String(cert.serialNumber || '').replace(/^0+/, '').toLowerCase() ===
    String(forge.util.bytesToHex(signerSerial || '')).replace(/^0+/, '').toLowerCase()
  )
  if (!signerCertificate) throw new Error('Apple provisioning profile imzalayıcı sertifikası bulunamadı.')

  const digestOid = forge.asn1.derToOid(digestAlgorithmNode.value[0].value)
  const digestNames = {
    '1.3.14.3.2.26': 'sha1',
    '2.16.840.1.101.3.4.2.1': 'sha256',
    '2.16.840.1.101.3.4.2.2': 'sha384',
    '2.16.840.1.101.3.4.2.3': 'sha512',
  }
  const digestName = digestNames[digestOid]
  if (!digestName) throw new Error('Provisioning profile CMS özet algoritması desteklenmiyor.')

  const attributes = authenticatedAttributesNode.value || []
  const messageDigestAttribute = attributes.find((attr) =>
    attr?.type === forge.asn1.Type.SEQUENCE &&
    attr?.value?.[0]?.type === forge.asn1.Type.OID &&
    forge.asn1.derToOid(attr.value[0].value) === forge.pki.oids.messageDigest
  )
  const contentTypeAttribute = attributes.find((attr) =>
    attr?.type === forge.asn1.Type.SEQUENCE &&
    attr?.value?.[0]?.type === forge.asn1.Type.OID &&
    forge.asn1.derToOid(attr.value[0].value) === forge.pki.oids.contentType
  )
  const expectedDigest = messageDigestAttribute?.value?.[1]?.value?.[0]?.value
  const contentTypeValue = contentTypeAttribute?.value?.[1]?.value?.[0]?.value
  if (!expectedDigest || !contentTypeValue ||
      forge.asn1.derToOid(contentTypeValue) !== forge.pki.oids.data) {
    throw new Error('Provisioning profile CMS imzalı öznitelikleri eksik veya geçersiz.')
  }

  const contentDigest = forge.md[digestName].create()
  contentDigest.update(eContentBytes)
  const actualDigest = contentDigest.digest().getBytes()
  if (actualDigest.length !== expectedDigest.length ||
      !actualDigest.split('').every((char, index) => char === expectedDigest[index])) {
    throw new Error('Provisioning profile içerik özeti imzalı CMS verisiyle eşleşmiyor.')
  }

  // CMS signs the DER encoding of the signedAttrs as a universal SET OF,
  // replacing the context-specific [0] tag used in SignerInfo.
  const signedAttributesSet = forge.asn1.create(
    forge.asn1.Class.UNIVERSAL,
    forge.asn1.Type.SET,
    true,
    attributes
  )
  const signedAttributesDer = forge.asn1.toDer(signedAttributesSet).getBytes()
  const signatureDigest = forge.md[digestName].create()
  signatureDigest.update(signedAttributesDer)
  let signatureValid = false
  try {
    signatureValid = signerCertificate.publicKey.verify(
      signatureDigest.digest().getBytes(),
      signatureNode.value
    )
  } catch {
    signatureValid = false
  }
  if (!signatureValid) {
    throw new Error('Provisioning profile dijital imzası geçersiz.')
  }

  const sameName = (left, right) => {
    const key = (name) => (name?.attributes || [])
      .map((attribute) => String(attribute.type) + '=' + String(attribute.value))
      .sort()
      .join('|')
    return !!key(left) && key(left) === key(right)
  }
  const profileCertificates = profileMessage.certificates || []
  const intermediate = profileCertificates.find((cert) =>
    cert !== signerCertificate && sameName(signerCertificate.issuer, cert.subject)
  )
  if (!intermediate || !intermediate.verify(signerCertificate)) {
    throw new Error('Apple provisioning profile imzalayıcı sertifikasının ara CA imzası doğrulanamadı.')
  }
  const root = profileCertificates.find((cert) =>
    cert !== signerCertificate && cert !== intermediate && sameName(intermediate.issuer, cert.subject)
  )
  if (!root) throw new Error('Apple Root CA sertifikası provisioning profile içinde bulunamadı.')
  const rootDer = forge.asn1.toDer(forge.pki.certificateToAsn1(root)).getBytes()
  const rootDigest = forge.md.sha256.create()
  rootDigest.update(rootDer)
  const appleRootFingerprint = 'b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024'
  if (rootDigest.digest().toHex().toLowerCase() !== appleRootFingerprint) {
    throw new Error('Provisioning profile güvenilir Apple Root CA sertifikasıyla zincirlenmiyor.')
  }
  if (!root.verify(intermediate) || !root.verify(root)) {
    throw new Error('Apple provisioning profile sertifika zinciri doğrulanamadı.')
  }
  for (const cert of [signerCertificate, intermediate, root]) {
    if (cert.validity.notBefore > now || cert.validity.notAfter <= now) {
      throw new Error('Apple provisioning profile sertifika zincirinde süresi geçersiz bir sertifika var.')
    }
  }

  const profileExpiry = certificate.validity.notAfter.toISOString().slice(0, 10)
  return {
    certificate_name: certificateName || 'Apple signing certificate',
    certificate_expires_at: certificate.validity.notAfter.toISOString(),
    profile_signature_valid: true,
    validation_status: 'validated',
    suggested_expiry: profileExpiry,
  }
}
async function appleApiToken(env) {
  const issuer = String(env.APPLE_ISSUER_ID || '').trim()
  const keyId = String(env.APPLE_KEY_ID || '').trim()
  const pem = String(env.APPLE_PRIVATE_KEY || '').trim()
  if (!issuer || !keyId || !pem) throw new Error('Apple API anahtarları eksik. APPLE_ISSUER_ID, APPLE_KEY_ID ve APPLE_PRIVATE_KEY kontrol edilmeli.')
  const privateKeyBytes = Uint8Array.from(
    atob(pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\s/g, '')),
    (char) => char.charCodeAt(0)
  )
  const key = await crypto.subtle.importKey('pkcs8', privateKeyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })))
  const payload = b64url(encoder.encode(JSON.stringify({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })))
  const signingInput = header + '.' + payload
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput))
  return signingInput + '.' + b64url(signature)
}
async function appleApiFetch(env, path, options = {}) {
  const token = await appleApiToken(env)
  const response = await fetch('https://api.appstoreconnect.apple.com' + path, {
    method: options.method || 'GET',
    headers: {
      authorization: 'Bearer ' + token,
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = body?.errors?.map((item) => item.detail || item.title).filter(Boolean).join('; ')
    throw new Error('Apple API ' + response.status + ': ' + (message || 'İstek başarısız.'))
  }
  return body
}
function bearer(request) {
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
}
function isActiveVip(row, now = Date.now()) {
  if (!row || row.status !== 'active' || row.vip_access_status === 'blocked') return false
  if (row.vip_plan === 'unlimited') return true
  if (row.vip_expires_at) return new Date(row.vip_expires_at).getTime() > now
  // Preserve the one existing legacy VIP account until an explicit expiry is assigned.
  return String(row.group_name || '').toLowerCase() === 'vip'
}
function cleanUser(row) {
  return {
    id: row.id, name: row.name, username: row.username, email: row.email || null,
    group_name: row.group_name, status: row.status, created_at: row.created_at,
    vip_plan: row.vip_plan || null, vip_expires_at: row.vip_expires_at || null,
    vip_access_status: row.vip_access_status || 'active', is_vip: isActiveVip(row),
    vip_days_remaining: row.vip_plan === 'unlimited' ? null : (row.vip_expires_at && new Date(row.vip_expires_at).getTime() > Date.now() ? Math.ceil((new Date(row.vip_expires_at).getTime() - Date.now()) / 86400000) : 0),
    vip_minutes_remaining: row.vip_plan === 'unlimited' ? null : (row.vip_expires_at && new Date(row.vip_expires_at).getTime() > Date.now() ? Math.floor((new Date(row.vip_expires_at).getTime() - Date.now()) / 60000) : 0)
  }
}
const VIP_PLANS = {
  month: { code: 'month', name: '1 Ay VIP', amount_try: 450, duration_days: 30 },
  quarter: { code: 'quarter', name: '3 Ay VIP', amount_try: 800, duration_days: 90 },
  half_year: { code: 'half_year', name: '6 Ay VIP', amount_try: 1500, duration_days: 180 },
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
      if (!env.SIGNER_SERVICE || typeof env.SIGNER_SERVICE.fetch !== 'function') {
        return json({ success: false, status: 'api-online', signer: 'not-bound', error: 'İmzalama motoru bağlı değil.' }, 503)
      }
      try {
        const signerResponse = await env.SIGNER_SERVICE.fetch(new Request('https://mehmetipa-signing.internal/health', { method: 'GET' }))
        const signerData = await signerResponse.json().catch(() => ({}))
        return json({
          success: signerResponse.ok,
          status: 'api-online',
          service: 'Mehmet IPA API',
          signer: signerResponse.ok ? 'ready' : 'unavailable',
          signer_detail: signerData
        }, signerResponse.ok ? 200 : 503)
      } catch (error) {
        return json({
          success: false,
          status: 'api-online',
          service: 'Mehmet IPA API',
          signer: 'unavailable',
          error: error instanceof Error ? error.message : 'İmzalama motoru sağlık kontrolü başarısız.'
        }, 503)
      }
    }

    // Public, unguessable, short-lived OTA install artifacts for iOS itms-services.
    const installMatch = path.match(/^\/api\/install\/([A-Za-z0-9_-]+)\/(manifest\.plist|app\.ipa)$/)
    if (installMatch && method === 'GET') {
      if (!env.CERTS || typeof env.CERTS.get !== 'function') return json({ success: false, error: 'Install storage unavailable.' }, 503)
      const [, token, artifact] = installMatch
      const key = 'signed-installs/' + token + '.ipa'
      // Pass byte-range requests through to R2 so iOS can resume large OTA IPA downloads.
      const object = artifact === 'app.ipa' && request.headers.has('range')
        ? await env.CERTS.get(key, { range: request.headers })
        : await env.CERTS.get(key)
      if (!object) return json({ success: false, error: 'Install link expired or not found.' }, 404)
      const metadata = object.customMetadata || {}
      if (!metadata.expiresAt || Date.now() > Number(metadata.expiresAt)) {
        await env.CERTS.delete(key).catch(() => {})
        return json({ success: false, error: 'Install link expired. Sign the IPA again.' }, 410)
      }
      if (artifact === 'manifest.plist') {
        const origin = new URL(request.url).origin
        const appUrl = origin + '/api/install/' + token + '/app.ipa'
        const iconUrl = origin + '/icon-light-192.png'
        const esc = (value) => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict><key>assets</key><array>
<dict><key>kind</key><string>software-package</string><key>url</key><string>${esc(appUrl)}</string></dict>
<dict><key>kind</key><string>display-image</string><key>url</key><string>${esc(iconUrl)}</string></dict>
<dict><key>kind</key><string>full-size-image</string><key>url</key><string>${esc(iconUrl)}</string></dict>
</array><key>metadata</key><dict><key>bundle-identifier</key><string>${esc(metadata.bundleId)}</string><key>bundle-version</key><string>${esc(metadata.version || '1.0')}</string><key>kind</key><string>software</string><key>title</key><string>${esc(metadata.title || 'Mehmet IPA')}</string></dict></dict></array></dict></plist>`
        return new Response(xml, { headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
      }
      const headers = new Headers({
        'content-type': 'application/octet-stream',
        'content-length': String(object.range?.length ?? object.size),
        'accept-ranges': 'bytes',
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      })
      if (object.range) {
        const start = object.range.offset
        const end = start + object.range.length - 1
        headers.set('content-range', 'bytes ' + start + '-' + end + '/' + object.size)
      }
      if (object.httpEtag) headers.set('etag', object.httpEtag)
      // Do not force Content-Disposition: iOS OTA downloads this as a software package, not a browser attachment.
      return new Response(object.body, { status: object.range ? 206 : 200, headers })
    }

    if (path === '/api/auth/register' && method === 'POST') {
      return json({ success: false, error: 'Yeni üyelik kayıtları şu anda kapalı. Mevcut hesabınla giriş yapabilirsin.' }, 403)
      if (!(await rateLimit(env, request, 'register', 5, 30))) return json({ success: false, error: 'Çok fazla kayıt denemesi. Bir süre sonra tekrar dene.' }, 429)
      const body = await readBody(request)
      const name = String(body.name || '').trim().slice(0, 80)
      const username = String(body.username || '').trim().toLowerCase()
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')
      if (!name || !/^[a-z0-9._-]{3,40}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) return json({ success: false, error: 'Ad soyad, geçerli e-posta, uygun kullanıcı adı ve en az 8 karakterli şifre gerekli.' }, 400)
      const existing = await env.DB.prepare('SELECT id FROM users WHERE username=? OR email=? LIMIT 1').bind(username, email).first()
      if (existing) return json({ success: false, error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.' }, 409)
      const id = randomId(), now = new Date().toISOString(), passwordHash = await hashPassword(password)
      try {
        await env.DB.prepare("INSERT INTO users (id,name,username,email,password_hash,group_name,status,created_at,email_verified) VALUES (?,?,?,?,?,'Standart','active',?,1)").bind(id,name,username,email,passwordHash,now).run()
      } catch {
        return json({ success: false, error: 'Bu kullanıcı adı veya e-posta zaten kullanılıyor.' }, 409)
      }
      return json({ success: true, message: 'Hesabın oluşturuldu. Şimdi giriş yapabilirsin.' }, 201)
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

      const row = await env.DB.prepare('SELECT id, name, username, password_hash, group_name, status, vip_plan, vip_expires_at, vip_access_status, email, created_at FROM users WHERE username = ? LIMIT 1').bind(username.toLowerCase()).first()
      if (!row || row.status !== 'active' || !(await verifyPassword(password, row.password_hash))) {
        return json({ success: false, error: 'Giriş bilgileri hatalı veya hesap engellenmiş.' }, 401)
      }
      if (String(row.password_hash || '').startsWith('pbkdf2' + String.fromCharCode(36) + '10000')) {
        const upgradedHash = await hashPassword(password)
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgradedHash, row.id).run()
      }
      const token = await issueToken({ sub: row.id, role: 'member', name: row.name, username: row.username }, env.ADMIN_PASSWORD)
      return json({ success: true, token, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum geçersiz veya süresi dolmuş.' }, 401)
      if (session.role === 'admin') return json({ success: true, user: { id: 'admin', name: 'Yönetici', username: session.username, role: 'admin' } })
      const row = await env.DB.prepare('SELECT id, name, username, email, group_name, status, created_at, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id = ?').bind(session.sub).first()
      if (!row || row.status !== 'active') return json({ success: false, error: 'Hesap etkin değil.' }, 401)
      return json({ success: true, user: { ...cleanUser(row), role: 'member' } })
    }

    if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
      const session = await readToken(bearer(request), env.ADMIN_PASSWORD)
      if (!session) return json({ success: false, error: 'Oturum açmanız gerekiyor.' }, 401)
      const isAdmin = session.role === 'admin'
      if (!isAdmin) { const activeUser = await env.DB.prepare("SELECT status FROM users WHERE id=? LIMIT 1").bind(session.sub).first(); if (!activeUser || activeUser.status !== 'active') return json({ success:false,error:'Hesabın devre dışı. Yöneticiyle iletişime geç.' },403) }
      const requireAdmin = () => isAdmin ? null : json({ success: false, error: 'Bu işlem yalnızca yöneticiye açık.' }, 403)

      // VIP status is calculated on the server; client-side flags never grant access.
      if (path === '/api/vip/status' && method === 'GET') {
        if (isAdmin) return json({ success: true, is_vip: false, plan: null, expires_at: null, legacy: false })
        const member = await env.DB.prepare('SELECT status, group_name, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id=? LIMIT 1').bind(session.sub).first()
        const isVip = isActiveVip(member)
        return json({ success: true, is_vip: isVip, plan: isVip ? member.vip_plan || 'legacy' : null, expires_at: member?.vip_expires_at || null, legacy: !!(isVip && !member?.vip_expires_at) })
      }

      // ONE-TIME TRIAL: server-side, one hour, one account and one approved device.
      if (path === '/api/trial/status' && method === 'GET') {
        if (isAdmin) return json({ success: true, started: false, active: false, can_start: false, has_approved_device: false })
        const member = await env.DB.prepare('SELECT status, group_name, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id = ? LIMIT 1').bind(session.sub).first()
        const vip = isActiveVip(member)
        const trial = await env.DB.prepare('SELECT device_udid, started_at, expires_at FROM trial_access WHERE user_id = ? LIMIT 1').bind(session.sub).first()
        const approvedDevice = await env.DB.prepare("SELECT udid FROM devices WHERE user_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1").bind(session.sub).first()
        const active = !!trial && new Date(trial.expires_at).getTime() > Date.now()
        return json({
          success: true,
          started: !!trial,
          active,
          can_start: !vip && !trial && !!approvedDevice,
          has_approved_device: !!approvedDevice,
          started_at: trial?.started_at || null,
          expires_at: trial?.expires_at || null,
          device_udid: trial?.device_udid || null
        })
      }

      if (path === '/api/trial/start' && method === 'POST') {
        if (isAdmin) return json({ success: false, error: 'Yönetici hesabı deneme başlatamaz.' }, 403)
        const member = await env.DB.prepare('SELECT status, group_name, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id = ? LIMIT 1').bind(session.sub).first()
        if (isActiveVip(member)) return json({ success: false, error: 'Zaten aktif VIP üyeliğin var.' }, 409)
        const existing = await env.DB.prepare('SELECT expires_at FROM trial_access WHERE user_id = ? LIMIT 1').bind(session.sub).first()
        if (existing) return json({ success: false, error: 'Ücretsiz deneme hakkın daha önce kullanılmış. Deneme yalnızca bir kez başlatılabilir.' }, 409)
        const approvedDevice = await env.DB.prepare("SELECT udid FROM devices WHERE user_id = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 1").bind(session.sub).first()
        if (!approvedDevice) return json({ success: false, error: 'Önce Hesabım bölümünden UDID kaydını gönderip yönetici onayı alman gerekiyor. Bu onay şu an Apple Developer kaydı değildir.' }, 409)
        const now = new Date()
        const startedAt = now.toISOString()
        const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        try {
          await env.DB.prepare('INSERT INTO trial_access (user_id, device_udid, started_at, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(session.sub, approvedDevice.udid, startedAt, expiresAt, startedAt).run()
        } catch {
          return json({ success: false, error: 'Bu hesap veya cihaz için deneme hakkı daha önce kullanılmış.' }, 409)
        }
        return json({ success: true, started: true, active: true, started_at: startedAt, expires_at: expiresAt, message: '1 saatlik ücretsiz denemen başladı.' }, 201)
      }

      if (path === '/api/vip/plans' && method === 'GET') {
        return json({ success: true, plans: Object.values(VIP_PLANS) })
      }

      if (path === '/api/vip/orders' && method === 'GET') {
        if (isAdmin) return json({ success: false, error: 'Bu ekran üye hesapları içindir.' }, 403)
        const { results = [] } = await env.DB.prepare(
          'SELECT id, plan_code, plan_name, amount_try, duration_days, status, created_at, paid_at, activated_at FROM vip_orders WHERE user_id=? ORDER BY created_at DESC LIMIT 30'
        ).bind(session.sub).all()
        return json({ success: true, orders: results })
      }

      if (path === '/api/vip/orders' && method === 'POST') {
        if (isAdmin) return json({ success: false, error: 'Yönetici hesabı VIP paketi satın alamaz.' }, 403)
        if (!(await rateLimit(env, request, 'vip-order', 8, 30))) return json({ success: false, error: 'Çok fazla paket talebi. Bir süre sonra tekrar dene.' }, 429)
        const body = await readBody(request)
        const plan = VIP_PLANS[String(body.plan_code || '')]
        if (!plan) return json({ success: false, error: 'Geçersiz VIP paketi.' }, 400)
        const id = randomId(), createdAt = new Date().toISOString()
        await env.DB.prepare(
          "INSERT INTO vip_orders (id,user_id,plan_code,plan_name,amount_try,duration_days,status,created_at) VALUES (?,?,?,?,?,?,'pending',?)"
        ).bind(id, session.sub, plan.code, plan.name, plan.amount_try, plan.duration_days, createdAt).run()
        return json({ success: true, order: { id, ...plan, status: 'pending', created_at: createdAt }, message: 'VIP talebin oluşturuldu. Ödeme bağlantısı henüz etkinleştirilmedi; yönetici onayı bekleniyor.' }, 201)
      }

      if (path === '/api/admin/vip-orders' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        const { results = [] } = await env.DB.prepare(
          'SELECT vip_orders.id, vip_orders.user_id, vip_orders.plan_code, vip_orders.plan_name, vip_orders.amount_try, vip_orders.duration_days, vip_orders.status, vip_orders.provider, vip_orders.provider_reference, vip_orders.created_at, vip_orders.paid_at, vip_orders.activated_at, users.name, users.username, users.email FROM vip_orders JOIN users ON users.id=vip_orders.user_id ORDER BY CASE vip_orders.status WHEN \'pending\' THEN 0 ELSE 1 END, vip_orders.created_at DESC LIMIT 200'
        ).all()
        return json({ success: true, orders: results })
      }

      const vipOrderMatch = path.match(/^\/api\/admin\/vip-orders\/([^/]+)$/)
      if (vipOrderMatch && method === 'POST') {
        const denied = requireAdmin(); if (denied) return denied
        const body = await readBody(request)
        const action = String(body.action || '')
        const order = await env.DB.prepare('SELECT * FROM vip_orders WHERE id=? LIMIT 1').bind(vipOrderMatch[1]).first()
        if (!order) return json({ success: false, error: 'VIP talebi bulunamadı.' }, 404)
        if (order.status !== 'pending') return json({ success: false, error: 'Bu talep daha önce işlenmiş.' }, 409)
        const now = new Date().toISOString()
        if (action === 'reject') {
          await env.DB.prepare("UPDATE vip_orders SET status='rejected' WHERE id=? AND status='pending'").bind(order.id).run()
          return json({ success: true })
        }
        if (action !== 'approve') return json({ success: false, error: 'Geçersiz işlem.' }, 400)
        const member = await env.DB.prepare('SELECT id, group_name, vip_expires_at, status FROM users WHERE id=? LIMIT 1').bind(order.user_id).first()
        if (!member || member.status !== 'active') return json({ success: false, error: 'Üye hesabı etkin değil.' }, 409)
        const currentExpiry = member.vip_expires_at ? new Date(member.vip_expires_at).getTime() : 0
        const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now()
        const expiresAt = new Date(base + Number(order.duration_days) * 86400000).toISOString()
        const result = await env.DB.batch([
          env.DB.prepare("UPDATE vip_orders SET status='approved', paid_at=?, activated_at=? WHERE id=? AND status='pending'").bind(now, now, order.id),
          env.DB.prepare("UPDATE users SET group_name='VIP', vip_plan=?, vip_expires_at=?, vip_updated_at=? WHERE id=?").bind(order.plan_code, expiresAt, now, order.user_id)
        ])
        if (!result?.length || Number(result[0]?.meta?.changes || 0) !== 1) return json({ success: false, error: 'Talep eşzamanlı olarak işlenmiş olabilir; yenileyip kontrol et.' }, 409)
        return json({ success: true, expires_at: expiresAt })
      }

      const manualVipMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/vip$/)
      if (manualVipMatch && method === 'POST') {
        const denied = requireAdmin(); if (denied) return denied
        const body = await readBody(request)
        const target = await env.DB.prepare('SELECT id, status, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id=? LIMIT 1').bind(manualVipMatch[1]).first()
        if (!target) return json({ success: false, error: 'Üye bulunamadı.' }, 404)
        const now = new Date().toISOString()
        if (body.action === 'revoke') {
          await env.DB.prepare("UPDATE users SET group_name='Standart', vip_plan=NULL, vip_expires_at=NULL, vip_access_status='active', vip_updated_at=? WHERE id=?").bind(now, target.id).run()
          return json({ success: true, message: 'VIP üyeliği kaldırıldı.' })
        }
        if (body.action === 'block' || body.action === 'unblock') {
          await env.DB.prepare("UPDATE users SET vip_access_status=?, vip_updated_at=? WHERE id=?").bind(body.action === 'block' ? 'blocked' : 'active', now, target.id).run()
          return json({ success: true, is_vip: body.action === 'unblock' && isActiveVip({ ...target, status: target.status, vip_access_status: 'active' }) })
        }
        if (body.action === 'extend') {
          const days = Number(body.days)
          if (!Number.isInteger(days) || days < 1 || days > 3650) return json({ success: false, error: 'Uzatma süresi 1-3650 gün arasında olmalı.' }, 400)
          const currentExpiry = target.vip_expires_at ? new Date(target.vip_expires_at).getTime() : 0
          const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now()
          const expiresAt = new Date(base + days * 86400000).toISOString()
          await env.DB.prepare("UPDATE users SET group_name='VIP', vip_plan=CASE WHEN vip_plan='unlimited' THEN 'unlimited' ELSE COALESCE(vip_plan,'manual') END, vip_expires_at=CASE WHEN vip_plan='unlimited' THEN NULL ELSE ? END, vip_access_status='active', vip_updated_at=? WHERE id=?").bind(expiresAt, now, target.id).run()
          return json({ success: true, expires_at: target.vip_plan === 'unlimited' ? null : expiresAt })
        }
        if (body.action === 'extend_time') {
          const minutes = Number(body.minutes)
          if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525600) return json({ success: false, error: 'Eklenecek süre 1-525600 dakika arasında olmalı.' }, 400)
          if (target.vip_plan === 'unlimited') return json({ success: false, error: 'Sınırsız VIP üyeliğine süre eklenemez.' }, 409)
          const currentExpiry = target.vip_expires_at ? new Date(target.vip_expires_at).getTime() : 0
          const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now()
          const expiresAt = new Date(base + minutes * 60000).toISOString()
          await env.DB.prepare("UPDATE users SET group_name='VIP', vip_plan=COALESCE(vip_plan,'manual'), vip_expires_at=?, vip_access_status='active', vip_updated_at=? WHERE id=?").bind(expiresAt, now, target.id).run()
          return json({ success: true, expires_at: expiresAt, minutes_added: minutes })
        }
        if (body.plan_code === 'unlimited') {
          await env.DB.prepare("UPDATE users SET group_name='VIP', vip_plan='unlimited', vip_expires_at=NULL, vip_access_status='active', vip_updated_at=? WHERE id=?").bind(now, target.id).run()
          return json({ success: true, expires_at: null, unlimited: true })
        }
        const plan = VIP_PLANS[String(body.plan_code || '')]
        if (!plan) return json({ success: false, error: 'Geçersiz VIP paketi.' }, 400)
        const currentExpiry = target.vip_expires_at ? new Date(target.vip_expires_at).getTime() : 0
        const base = Number.isFinite(currentExpiry) && currentExpiry > Date.now() ? currentExpiry : Date.now()
        const expiresAt = new Date(base + plan.duration_days * 86400000).toISOString()
        await env.DB.prepare("UPDATE users SET group_name='VIP', vip_plan=?, vip_expires_at=?, vip_access_status='active', vip_updated_at=? WHERE id=?").bind(plan.code, expiresAt, now, target.id).run()
        return json({ success: true, expires_at: expiresAt })
      }

      // Per-user signing progress feed. Job IDs are unguessable UUIDs and records live in the private R2 bucket.
      const signingProgressMatch = path.match(/^\/api\/signing\/progress\/([0-9a-f-]{36})$/i)
      if (signingProgressMatch && method === 'GET') {
        if (!env.CERTS || typeof env.CERTS.get !== 'function') return json({ success: false, error: 'İlerleme kaydı okunamıyor.' }, 503)
        const item = await env.CERTS.get('signing-progress/' + signingProgressMatch[1] + '.json')
        if (!item) return json({ success: false, error: 'İşlem kaydı henüz oluşmadı.' }, 404)
        const state = await item.json()
        if (state.user_id !== session.sub) return json({ success: false, error: 'Bu imza işlemini görüntüleme yetkin yok.' }, 403)
        const { user_id, ...publicState } = state
        return json({ success: true, ...publicState })
      }

      if (path === '/api/admin/registration-requests' && method === 'GET') {
        const denied=requireAdmin(); if(denied) return denied
        const {results=[]}=await env.DB.prepare("SELECT id,name,username,email,status,created_at,verified_at FROM registration_requests WHERE status IN ('pending','verification_pending','rejected') ORDER BY created_at DESC").all()
        return json({success:true,requests:results})
      }
      const registrationMatch=path.match(/^\/api\/admin\/registration-requests\/([^/]+)$/)
      if(registrationMatch && method==='POST') {
        const denied=requireAdmin(); if(denied) return denied; const body=await readBody(request), action=body.action
        const row=await env.DB.prepare('SELECT * FROM registration_requests WHERE id=? LIMIT 1').bind(registrationMatch[1]).first()
        if(!row || (row.status!=='pending' && !(action==='reopen' && row.status==='rejected'))) return json({success:false,error:'Başvuru bulunamadı veya e-posta doğrulanmadı.'},404)
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
        const { results = [] } = await env.DB.prepare('SELECT id, name, username, email, group_name, status, created_at, vip_plan, vip_expires_at, vip_access_status FROM users ORDER BY created_at DESC').all()
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

      // APPLE: read-only connection check. Does not register or modify devices.
      if (path === '/api/admin/apple/devices' && method === 'GET') {
        const denied = requireAdmin(); if (denied) return denied
        try {
          const result = await appleApiFetch(env, '/v1/devices?limit=200&fields%5Bdevices%5D=name%2Cplatform%2Cudid%2Cstatus%2CaddedDate')
          return json({
            success: true,
            connected: true,
            total: result.data?.length || 0,
            devices: (result.data || []).map((item) => ({
              id: item.id,
              name: item.attributes?.name || '',
              platform: item.attributes?.platform || '',
              udid: item.attributes?.udid || '',
              status: item.attributes?.status || '',
              added_date: item.attributes?.addedDate || null
            }))
          })
        } catch (error) {
          return json({ success: false, connected: false, error: error instanceof Error ? error.message : 'Apple bağlantısı kurulamadı.' }, 502)
        }
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

        if (status === 'approved') {
          const device = await env.DB.prepare(
            'SELECT devices.id, devices.udid, users.name, users.username FROM devices LEFT JOIN users ON users.id = devices.user_id WHERE devices.id = ? LIMIT 1'
          ).bind(deviceMatch[2]).first()
          if (!device) return json({ success: false, error: 'Cihaz kaydı bulunamadı.' }, 404)

          const udid = String(device.udid || '').trim().toUpperCase()
          if (!/^[A-F0-9-]{20,40}$/.test(udid)) {
            return json({ success: false, error: 'Kayıtlı UDID biçimi geçersiz. Apple kaydı yapılmadı.' }, 400)
          }

          try {
            // Önce Apple'da tam UDID eşleşmesini sorgula. Kayıt varsa üyeliği onaylama.
            const appleLookup = await appleApiFetch(
              env,
              '/v1/devices?filter%5Budid%5D=' + encodeURIComponent(udid) + '&limit=1&fields%5Bdevices%5D=name%2Cplatform%2Cudid%2Cstatus'
            )
            const existingAppleDevice = (appleLookup.data || []).find(
              item => String(item.attributes?.udid || '').trim().toUpperCase() === udid
            )
            if (existingAppleDevice) {
              return json({
                success: false,
                code: 'UDID_ALREADY_REGISTERED',
                already_registered: true,
                apple_registered: true,
                error: 'Bu UDID Apple Developer hesabında zaten kayıtlı. Üyelik onaylanmadı.'
              }, 409)
            }

            const deviceName = String(device.name || device.username || 'Mehmet IPA üyesi')
              .replace(/[\\r\\n]/g, ' ').trim().slice(0, 50) || 'Mehmet IPA üyesi'
            const created = await appleApiFetch(env, '/v1/devices', {
              method: 'POST',
              body: {
                data: {
                  type: 'devices',
                  attributes: { name: deviceName, platform: 'IOS', udid }
                }
              }
            })
            const appleDevice = created.data
            if (!appleDevice?.id) {
              return json({ success: false, error: 'Apple cihaz kaydı doğrulanamadı. Üyelik onaylanmadı.' }, 502)
            }

            await env.DB.prepare('UPDATE devices SET status = ? WHERE id = ?').bind('approved', deviceMatch[2]).run()
            return json({
              success: true,
              status: 'approved',
              apple_registered: true,
              already_registered: false,
              apple_device_id: appleDevice.id,
              message: 'UDID Apple Developer hesabına kaydedildi; üyelik onaylandı.'
            })
          } catch (error) {
            return json({
              success: false,
              apple_registered: false,
              error: error instanceof Error ? error.message : 'Apple cihaz kaydı başarısız. Üyelik onaylanmadı.'
            }, 502)
          }
        }

        await env.DB.prepare('UPDATE devices SET status = ? WHERE id = ?').bind(status, deviceMatch[2]).run()
        return json({ success: true, status })
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
        const accountDevice = await env.DB.prepare('SELECT id FROM devices WHERE user_id = ? LIMIT 1').bind(session.sub).first()
        if (accountDevice) return json({ success: false, error: 'Her hesap için yalnızca bir UDID kaydı yapılabilir. Kayıt silinemez veya değiştirilemez.' }, 409)
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


      // SIGNING: Yönetici sertifikayı ve özel kasadaki dosyalarını siler
      if (path === '/api/admin/certificate' && method === 'DELETE') {
        const denied = requireAdmin()
        if (denied) return denied
        if (!env.CERTS) return json({ success: false, error: 'Sertifika kasası bağlı değil.' }, 503)
        const { results = [] } = await env.DB.prepare(
          'SELECT id, p12_key, profile_key FROM signing_certificate'
        ).all()
        for (const item of results) {
          if (item.p12_key) await env.CERTS.delete(item.p12_key)
          if (item.profile_key) await env.CERTS.delete(item.profile_key)
        }
        await env.DB.prepare('DELETE FROM signing_certificate').run()
        return json({ success: true, deleted: results.length })
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

        if (!env.CERTS || typeof env.CERTS.put !== 'function') {
          return json({ success: false, error: 'Cloudflare R2 CERTS bağlantısı çalışma ortamına gelmiyor. Pages > Settings > Bindings bölümündeki production R2 binding adını CERTS olarak kontrol edin.' }, 503)
        }
        if (typeof env.SIGNING_ENCRYPTION_KEY !== 'string' || !env.SIGNING_ENCRYPTION_KEY) {
          return json({ success: false, error: 'SIGNING_ENCRYPTION_KEY gizli değişkeni production çalışma ortamında boş veya bağlı değil. Pages > Settings > Variables and Secrets bölümünden 32+ karakterli Secret olarak kaydedin ve yeniden dağıtım yapın.' }, 503)
        }
        if (env.SIGNING_ENCRYPTION_KEY.length < 32) {
          return json({ success: false, error: 'SIGNING_ENCRYPTION_KEY en az 32 karakter olmalı. Production Secret değerini 64 karakterlik rastgele anahtarla güncelleyin.' }, 503)
        }

        const body = await readBody(request)
        let certificateName = String(body.certificate_name || '').trim().slice(0, 180)
        const profileName = String(body.profile_name || '').trim().slice(0, 180)
        const password = String(body.password || '')
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

        let validation
        try {
          validation = validateSigningMaterials(p12Bytes, profileBytes, password)
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : 'Sertifika doğrulaması başarısız.' }, 400)
        }
        certificateName = validation.certificate_name
        const expiresAt = validation.certificate_expires_at

        const id = randomId()
        const p12Key = `certificates/${id}/certificate.p12.enc`
        const profileKey = `certificates/${id}/profile.mobileprovision.enc`
        const [encryptedP12, encryptedProfile, encryptedPassword] = await Promise.all([
          encryptBytes(p12Bytes, env.SIGNING_ENCRYPTION_KEY),
          encryptBytes(profileBytes, env.SIGNING_ENCRYPTION_KEY),
          encryptSecret(password, env.SIGNING_ENCRYPTION_KEY)
        ])
        const previous = await env.DB.prepare(
          'SELECT id, p12_key, profile_key FROM signing_certificate'
        ).all()

        try {
          await env.CERTS.put(p12Key, encryptedP12.ciphertext, {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { encryption: 'AES-256-GCM', iv: encryptedP12.iv }
          })
          await env.CERTS.put(profileKey, encryptedProfile.ciphertext, {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { encryption: 'AES-256-GCM', iv: encryptedProfile.iv }
          })

          await env.DB.prepare(
            `INSERT INTO signing_certificate
            (id, status, certificate_name, profile_name, password_ciphertext, password_iv,
             p12_key, profile_key, p12_iv, profile_iv, expires_at, updated_at)
            VALUES (?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            id, certificateName, profileName,
            encryptedPassword.ciphertext, encryptedPassword.iv,
            p12Key, profileKey, encryptedP12.iv, encryptedProfile.iv,
            expiresAt, new Date().toISOString()
          ).run()
        } catch (error) {
          try { await env.CERTS.delete(p12Key) } catch {}
          try { await env.CERTS.delete(profileKey) } catch {}
          throw error
        }

        // Delete older objects, including the previous plaintext uploads, only after
        // the new encrypted copy and its database row have been committed.
        for (const old of (previous.results || [])) {
          if (old.id === id) continue
          if (old.p12_key) { try { await env.CERTS.delete(old.p12_key) } catch {} }
          if (old.profile_key) { try { await env.CERTS.delete(old.profile_key) } catch {} }
          try { await env.DB.prepare('DELETE FROM signing_certificate WHERE id = ?').bind(old.id).run() } catch {}
        }

        return json({
          success: true,
          certificate: {
            id,
            status: 'active',
            certificate_name: certificateName,
            profile_name: profileName,
            expires_at: expiresAt
          },
          validation,
          message: 'P12 parolası, sertifika-anahtar eşleşmesi, sertifika süresi ve provisioning profile CMS imzası kontrol edildi. Dosyalar AES-256-GCM ile şifrelenerek özel kasaya kaydedildi.'
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

      // SIGNING: VIP üyeler için sunucu tarafında imzalama
      if (path === '/api/signing/vip' && method === 'POST') {
        if (isAdmin) return json({ success: false, error: 'Yönetici hesabı VIP üye imzası başlatamaz.' }, 403)
        const member = await env.DB.prepare(
          'SELECT username, group_name, status, vip_plan, vip_expires_at, vip_access_status FROM users WHERE id = ? LIMIT 1'
        ).bind(session.sub).first()
        const activeTrial = !isActiveVip(member)
          ? await env.DB.prepare('SELECT device_udid, expires_at FROM trial_access WHERE user_id = ? LIMIT 1').bind(session.sub).first()
          : null
        const trialIsActive = !!activeTrial && new Date(activeTrial.expires_at).getTime() > Date.now()
        if (!isActiveVip(member) && !trialIsActive) {
          return json({ success: false, error: 'Aktif VIP üyeliği veya süresi dolmamış 1 saatlik deneme hakkı gerekiyor.' }, 403)
        }
        if (trialIsActive) {
          const trialDevice = await env.DB.prepare("SELECT id FROM devices WHERE user_id = ? AND udid = ? AND status = 'approved' LIMIT 1").bind(session.sub, activeTrial.device_udid).first()
          if (!trialDevice) return json({ success: false, error: 'Denemeyi başlattığın onaylı UDID hesabında bulunamadı. Aynı cihazı yeniden kaydedip onaylatman gerekiyor.' }, 403)
        }
        const blockedDevice = await env.DB.prepare(
          "SELECT udid FROM devices WHERE user_id = ? AND status = 'blocked' ORDER BY created_at DESC LIMIT 1"
        ).bind(session.sub).first()
        if (blockedDevice) {
          const udid = String(blockedDevice.udid || '')
          const maskedUdid = udid.length > 8 ? `${udid.slice(0, 4)}••••${udid.slice(-4)}` : 'Kayıtlı UDID'
          return json({
            success: false,
            code: 'DEVICE_BLOCKED',
            error: `Cihaz UDID erişimi engellendi (${maskedUdid}). IPA imzalama ve indirme işlemi durduruldu. Yöneticiyle iletişime geç.`
          }, 403)
        }
        if (!env.CERTS || typeof env.CERTS.get !== 'function') {
          return json({ success: false, error: 'Sertifika kasası bağlı değil.' }, 503)
        }
        if (typeof env.SIGNING_ENCRYPTION_KEY !== 'string' || env.SIGNING_ENCRYPTION_KEY.length < 32) {
          return json({ success: false, error: 'Sertifika şifreleme anahtarı yapılandırılmamış.' }, 503)
        }
        if (!env.SIGNER_SERVICE || typeof env.SIGNER_SERVICE.fetch !== 'function') {
          return json({ success: false, error: 'VIP imzalama motoru henüz bağlanmadı.' }, 503)
        }

        const cert = await env.DB.prepare(
          `SELECT status, certificate_name, profile_name, password_ciphertext, password_iv,
           p12_key, profile_key, p12_iv, profile_iv, expires_at
           FROM signing_certificate ORDER BY updated_at DESC LIMIT 1`
        ).first()
        if (!cert || cert.status !== 'active' || !cert.p12_key || !cert.profile_key ||
            !cert.password_ciphertext || !cert.password_iv || !cert.p12_iv || !cert.profile_iv) {
          return json({ success: false, error: 'VIP sertifikası eksik veya etkin değil.' }, 409)
        }
        if (cert.expires_at && new Date(cert.expires_at).getTime() <= Date.now()) {
          return json({ success: false, error: 'VIP sertifikasının süresi dolmuş.' }, 409)
        }

        let formData
        try { formData = await request.formData() } catch {
          return json({ success: false, error: 'IPA yüklemesi okunamadı.' }, 400)
        }
        const ipa = formData.get('ipa')
        if (!(ipa instanceof File) || !ipa.name.toLowerCase().endsWith('.ipa') || ipa.size < 1) {
          return json({ success: false, error: 'Geçerli bir IPA dosyası seç.' }, 400)
        }
        if (ipa.size > 100 * 1024 * 1024) {
          return json({ success: false, error: 'IPA dosyası en fazla 100 MB olabilir.' }, 413)
        }
        const jobId = String(formData.get('job_id') || '')
        if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ success: false, error: 'İmza işlem kimliği geçersiz.' }, 400)
        const progressLogs = []
        const writeProgress = async (stage, percent, label, log) => {
          progressLogs.push({ at: new Date().toISOString(), text: String(log).slice(0, 240) })
          const state = { job_id: jobId, user_id: session.sub, stage, percent, label, logs: progressLogs.slice(-80), updated_at: new Date().toISOString() }
          try {
            await env.CERTS.put('signing-progress/' + jobId + '.json', JSON.stringify(state), {
              httpMetadata: { contentType: 'application/json; charset=utf-8' },
              customMetadata: { expiresAt: String(Date.now() + 6 * 60 * 60 * 1000) }
            })
          } catch (error) { console.warn('[Mehmet IPA progress]', error instanceof Error ? error.message : 'write failed') }
        }
        const zipHeader = new Uint8Array(await ipa.slice(0, 4).arrayBuffer())
        if (!(zipHeader[0] === 0x50 && zipHeader[1] === 0x4b && (zipHeader[2] === 0x03 || zipHeader[2] === 0x05 || zipHeader[2] === 0x07))) {
          return json({ success: false, error: 'IPA dosyası geçerli bir ZIP arşivi değil.' }, 400)
        }
        await writeProgress(1, 42, 'IPA dosyası doğrulandı', '01/05 · Dosya uzantısı, boyutu ve ZIP imzası doğrulandı.')
        await writeProgress(2, 48, 'IPA paketi imzalama motoruna hazırlanıyor', '02/05 · IPA arşivi imzalama motoruna aktarılmak üzere hazırlandı.')

        const logId = randomId()
        const createdAt = new Date().toISOString()
        await env.DB.prepare(
          `INSERT INTO signing_logs (id, user_id, username, mode, ipa_name, status, created_at)
           VALUES (?, ?, ?, 'vip', ?, 'started', ?)`
        ).bind(logId, session.sub, member.username, ipa.name.slice(0, 180), createdAt).run()

        try {
          const [p12Object, profileObject] = await Promise.all([
            env.CERTS.get(cert.p12_key),
            env.CERTS.get(cert.profile_key)
          ])
          if (!p12Object || !profileObject) throw new Error('Sertifika dosyaları kasada bulunamadı.')
          const [encryptedP12, encryptedProfile] = await Promise.all([
            p12Object.arrayBuffer(),
            profileObject.arrayBuffer()
          ])
          const [p12Bytes, profileBytes, password] = await Promise.all([
            decryptBytes(encryptedP12, cert.p12_iv, env.SIGNING_ENCRYPTION_KEY),
            decryptBytes(encryptedProfile, cert.profile_iv, env.SIGNING_ENCRYPTION_KEY),
            decryptSecret(cert.password_ciphertext, cert.password_iv, env.SIGNING_ENCRYPTION_KEY)
          ])
          await writeProgress(3, 58, 'Sertifika ve profil hazır', '03/05 · Şifreli P12 ve provisioning profile özel kasadan çözüldü; sertifika durumu ve süre kontrol edildi.')

          const signingForm = new FormData()
          signingForm.append('ipa', ipa, ipa.name)
          signingForm.append('p12', new File([p12Bytes], 'certificate.p12', { type: 'application/x-pkcs12' }))
          signingForm.append('mobileprovision', new File([profileBytes], 'profile.mobileprovision', { type: 'application/octet-stream' }))
          signingForm.append('p12_password', password)

          // Warm the same Durable Object Container immediately before forwarding the IPA.
          // A separate browser health check may have gone idle before the signing request arrives.
          await writeProgress(4, 64, 'Zsign motoru başlatılıyor', '04/05 · Özel imzalama konteyneri uyandırılıyor.')
          const warmup = await env.SIGNER_SERVICE.fetch(new Request('https://mehmetipa-signing.internal/health', {
            method: 'GET'
          }))
          if (!warmup.ok) {
            const warmupDetail = await warmup.json().catch(() => ({}))
            throw new Error('İmzalama motoru hazır değil: ' + (warmupDetail.detail || warmupDetail.error || warmup.status))
          }

          await writeProgress(4, 70, 'IPA zsign ile imzalanıyor', '04/05 · Zsign motoruna IPA, sertifika ve provisioning profile gönderildi.')
          const signed = await env.SIGNER_SERVICE.fetch(new Request('https://mehmetipa-signing.internal/sign', {
            method: 'POST',
            body: signingForm
          }))
          if (!signed.ok) {
            const detail = await signed.json().catch(() => ({}))
            await env.DB.prepare("UPDATE signing_logs SET status = 'failed' WHERE id = ?").bind(logId).run()
            const signingError = [detail.error, detail.detail, detail.diagnostic].filter(Boolean).join(' — ')
            await env.DB.prepare("UPDATE signing_logs SET status = 'failed' WHERE id = ?").bind(logId).run()
            return json({ success: false, error: signingError || 'IPA imzalanamadı.' }, signed.status)
          }

          await writeProgress(5, 88, 'İmza doğrulaması yapılıyor', '05/05 · İmzalı IPA çıktısı alındı; Bundle ID ve sürüm bilgileri doğrulanıyor.')
          const bundleId = signed.headers.get('x-app-bundle-id') || ''
          const appVersion = signed.headers.get('x-app-version') || '1.0'
          if (!bundleId || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleId)) throw new Error('İmzalı uygulamanın Bundle ID bilgisi geçersiz.')
          const signedSize = Number(signed.headers.get('content-length') || 0)
          if (signedSize > 100 * 1024 * 1024) throw new Error('İmzalı IPA dosyası 100 MB sınırını aşıyor.')
          if (signedSize > 0 && signedSize < 1024) throw new Error('İmzalı IPA çıktısı geçersiz.')
          const installToken = randomToken()
          const installKey = 'signed-installs/' + installToken + '.ipa'
          const expiresAt = Date.now() + 60 * 60 * 1000
          const fileName = ipa.name.replace(/\\.ipa$/i, '') + '-signed.ipa'
          // Remove expired signed IPA artifacts during the next signing run.
          // Only the signed-installs/ prefix is touched; certificates and user uploads are preserved.
          try {
            let cursor
            do {
              const page = await env.CERTS.list({ prefix: 'signed-installs/', cursor, limit: 1000, include: ['customMetadata'] })
              const now = Date.now()
              const expired = (page.objects || []).filter((item) =>
                item.key !== installKey &&
                Number(item.customMetadata?.expiresAt || 0) > 0 &&
                Number(item.customMetadata.expiresAt) <= now
              )
              await Promise.all(expired.map((item) => env.CERTS.delete(item.key).catch(() => {})))
              cursor = page.truncated ? page.cursor : undefined
            } while (cursor)
          } catch (cleanupError) {
            console.warn('[Mehmet IPA cleanup]', cleanupError instanceof Error ? cleanupError.message : 'cleanup failed')
          }
          await env.CERTS.put(installKey, signed.body, {
            httpMetadata: { contentType: 'application/octet-stream' },
            customMetadata: { bundleId, version: appVersion, title: 'Mehmet IPA', fileName, expiresAt: String(expiresAt), username: member.username }
          })
          await writeProgress(5, 100, 'İmzalama tamamlandı · IPA hazır', '05/05 · İmza doğrulandı, IPA özel depoya kaydedildi ve kurulum bağlantıları hazırlandı.')
          await env.DB.prepare("UPDATE signing_logs SET status = 'success' WHERE id = ?").bind(logId).run()
          const origin = new URL(request.url).origin
          const manifestUrl = origin + '/api/install/' + installToken + '/manifest.plist'
          const downloadUrl = origin + '/api/install/' + installToken + '/app.ipa'
          return json({
            success: true,
            bundle_id: bundleId,
            version: appVersion,
            file_name: fileName,
            expires_at: new Date(expiresAt).toISOString(),
            download_url: downloadUrl,
            manifest_url: manifestUrl,
            install_url: 'itms-services://?action=download-manifest&url=' + encodeURIComponent(manifestUrl)
          })
        } catch (error) {
          await env.DB.prepare("UPDATE signing_logs SET status = 'failed' WHERE id = ?").bind(logId).run()
          return json({ success: false, error: error instanceof Error ? error.message : 'İmzalama işlemi başarısız.' }, 502)
        }
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
    console.error('[Mehmet IPA API]', error)
    const detail = error instanceof Error ? error.message.slice(0, 180) : 'Bilinmeyen sunucu hatası'
    return json({ success: false, error: 'Sunucu hatası: ' + detail }, 500)
  }
}
