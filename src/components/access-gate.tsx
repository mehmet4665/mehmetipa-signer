import * as React from 'react'
import { SylvaSigner } from '@/components/sylva-signer'
import { Capacitor } from '@capacitor/core'

type User = {
  id: string
  name: string
  username: string
  role: 'admin' | 'member'
  group_name?: string
  status?: string
}
type Device = {
  id: string
  user_id?: string
  name?: string
  username?: string
  udid: string
  status: 'pending' | 'approved' | 'blocked'
  created_at?: string
}

const TOKEN_KEY = 'mehmetipa.session.v1'
const APP_DOWNLOAD = 'https://github.com/mehmet4665/mehmetipa-signer/releases/download/latest/Mehmet-IPA-iOS.ipa'
const API_BASE = 'https://mehmetipa-signer.pages.dev'

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', `Bearer ${token}`)
  const url = /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`
  const response = await fetch(url, { ...init, headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || `İstek başarısız (${response.status})`)
  return data
}

function Brand() {
  return <div className="flex items-center justify-center gap-3">
    <img src="/icon-dark-512.PNG" alt="Mehmet IPA" className="h-12 w-12 rounded-2xl object-cover" />
    <div className="text-left"><div className="text-xl font-bold tracking-tight">Mehmet IPA</div><div className="text-xs text-muted-foreground">IPA Signing Platform</div></div>
  </div>
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-background px-4 py-10 text-foreground"><div className="mx-auto w-full max-w-5xl">{children}</div></main>
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="grid gap-1.5 text-sm font-medium">{label}<input {...props} className={`h-11 w-full rounded-xl border border-input bg-background px-3 text-base outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20 ${props.className || ''}`} /></label>
}

export function AccessGate() {
  const [token, setToken] = React.useState('')
  const [user, setUser] = React.useState<User | null>(null)
  const [view, setView] = React.useState<'home' | 'login' | 'admin' | 'method' | 'signer'>('home')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [users, setUsers] = React.useState<User[]>([])
  const [devices, setDevices] = React.useState<Device[]>([])
  const [newName, setNewName] = React.useState('')
  const [newUsername, setNewUsername] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [newGroup, setNewGroup] = React.useState('Standart')
  const [udid, setUdid] = React.useState('')
  const [myDevices, setMyDevices] = React.useState<Device[]>([])
  const [certificate, setCertificate] = React.useState<{status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null>(null)
  const [p12File, setP12File] = React.useState<File|null>(null)
  const [profileFile, setProfileFile] = React.useState<File|null>(null)
  const [certificatePassword, setCertificatePassword] = React.useState('')
  const [certificateExpiry, setCertificateExpiry] = React.useState('')
  const [currentLocation, setCurrentLocation] = React.useState(() => typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.hash}`)
  const isPublicDocument = currentLocation === '/privacy' || currentLocation === '/legal' || currentLocation.endsWith('#privacy') || currentLocation.endsWith('#legal')

  React.useEffect(() => {
    const updateLocation = () => setCurrentLocation(`${window.location.pathname}${window.location.hash}`)
    window.addEventListener('hashchange', updateLocation)
    window.addEventListener('popstate', updateLocation)
    return () => { window.removeEventListener('hashchange', updateLocation); window.removeEventListener('popstate', updateLocation) }
  }, [])

  const loadAdmin = React.useCallback(async (activeToken: string) => {
    const [u, d, c] = await Promise.all([
      api<{ users: User[] }>('/api/admin/users', activeToken),
      api<{ devices: Device[] }>('/api/admin/devices', activeToken),
      api<{ certificate: {status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null }>('/api/admin/certificate', activeToken),
    ])
    setUsers(u.users || [])
    setDevices(d.devices || [])
    setCertificate(c.certificate)
  }, [])

  const loadMemberDevices = React.useCallback(async (activeToken: string) => {
    const result = await api<{ devices: Device[] }>('/api/devices', activeToken)
    setMyDevices(result.devices || [])
  }, [])

  React.useEffect(() => {
    const saved = window.sessionStorage.getItem(TOKEN_KEY)
    if (!saved) return
    let alive = true
    api<{ user?: User }>('/api/auth/me', saved).then((result) => {
      if (!alive) return
      const current = result?.user
      if (!current || !current.id || !['admin', 'member'].includes(current.role)) {
        window.sessionStorage.removeItem(TOKEN_KEY)
        setToken('')
        setUser(null)
        setView('home')
        setError('Oturum bilgisi geçersiz. Lütfen yeniden giriş yap.')
        return
      }
      setToken(saved)
      setUser(current)
      setView(current.role === 'admin' ? 'admin' : 'method')
    }).catch(() => {
      if (!alive) return
      window.sessionStorage.removeItem(TOKEN_KEY)
      setToken('')
      setUser(null)
      setView('home')
    })
    return () => { alive = false }
  }, [])

  React.useEffect(() => {
    if (!token || !user) return
    if (user.role === 'admin' && view === 'admin') loadAdmin(token).catch((e) => setError(e.message))
    if (user.role === 'member' && view === 'signer') loadMemberDevices(token).catch((e) => setError(e.message))
  }, [token, user, view, loadAdmin, loadMemberDevices])

  const login = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ token: string; user: User }>('/api/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ username, password }),
      })
      if (!result?.token || !result?.user || !['admin', 'member'].includes(result.user.role)) {
        throw new Error('Sunucudan geçerli kullanıcı bilgisi alınamadı. Bağlantıyı kontrol edip tekrar dene.')
      }
      window.sessionStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token); setUser(result.user)
      setView(result.user.role === 'admin' ? 'admin' : 'method')
      setPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Giriş başarısız.') }
    finally { setBusy(false) }
  }

  const logout = () => {
    window.sessionStorage.removeItem(TOKEN_KEY)
    setToken(''); setUser(null); setUsers([]); setDevices([]); setMyDevices([]); setView('home'); setError(''); setNotice('')
  }

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault(); if (!token) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/users', token, { method: 'POST', body: JSON.stringify({ name: newName, username: newUsername, password: newPassword, group_name: newGroup }) })
      setNewName(''); setNewUsername(''); setNewPassword(''); setNewGroup('Standart')
      setNotice('Kullanıcı oluşturuldu.')
      await loadAdmin(token)
    } catch (e) { setError(e instanceof Error ? e.message : 'Kullanıcı oluşturulamadı.') }
    finally { setBusy(false) }
  }


  const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Dosya okunamadı.'))
    reader.onerror = () => reject(new Error('Dosya okunamadı.'))
    reader.readAsDataURL(file)
  })

  const uploadCertificate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!token || !p12File || !profileFile) {
      setError('P12 ve provisioning profile dosyalarını seç.')
      return
    }
    if (p12File.size > 5 * 1024 * 1024 || profileFile.size > 1024 * 1024) {
      setError('P12 en fazla 5 MB, provisioning profile en fazla 1 MB olabilir.')
      return
    }
    setBusy(true); setError(''); setNotice('')
    try {
      const [p12Base64, profileBase64] = await Promise.all([fileToDataUrl(p12File), fileToDataUrl(profileFile)])
      await api('/api/admin/certificate', token, {
        method: 'POST',
        body: JSON.stringify({
          certificate_name: p12File.name,
          profile_name: profileFile.name,
          password: certificatePassword,
          expires_at: certificateExpiry || null,
          p12_base64: p12Base64,
          profile_base64: profileBase64,
        }),
      })
      setP12File(null); setProfileFile(null); setCertificatePassword(''); setCertificateExpiry('')
      setNotice('Sertifika dosyaları özel kasaya yüklendi. Durum: doğrulama bekliyor.')
      await loadAdmin(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sertifika yüklenemedi.')
    } finally { setBusy(false) }
  }

  const updateUser = async (target: User, changes: { status?: string; group_name?: string }) => {
    if (!token) return
    setError(''); setNotice('')
    try {
      await api(`/api/admin/users/${encodeURIComponent(target.id)}`, token, { method: 'PATCH', body: JSON.stringify(changes) })
      await loadAdmin(token)
      setNotice('Kullanıcı güncellendi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Güncelleme başarısız.') }
  }

  const deleteUser = async (target: User) => {
    if (!token || !window.confirm(`${target.username} hesabı ve cihaz kayıtları silinsin mi?`)) return
    try {
      await api(`/api/admin/users/${encodeURIComponent(target.id)}`, token, { method: 'DELETE' })
      await loadAdmin(token); setNotice('Kullanıcı silindi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Silme başarısız.') }
  }

  const updateDevice = async (device: Device, status: Device['status']) => {
    if (!token) return
    try {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}`, token, { method: 'PATCH', body: JSON.stringify({ status }) })
      await loadAdmin(token); setNotice('Cihaz durumu güncellendi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Cihaz güncellenemedi.') }
  }

  const registerDevice = async (event: React.FormEvent) => {
    event.preventDefault(); if (!token) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/devices', token, { method: 'POST', body: JSON.stringify({ udid }) })
      setUdid(''); await loadMemberDevices(token); setNotice('Cihaz onay için yöneticiye gönderildi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Cihaz kaydedilemedi.') }
    finally { setBusy(false) }
  }

  const isInstalledApp = typeof window !== 'undefined' && (
    Capacitor.isNativePlatform() ||
    Capacitor.getPlatform() !== 'web' ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )

  if (isPublicDocument) return <SylvaSigner />
if (view === 'method' && user?.role === 'member') return <Frame>
  <header className="flex items-center justify-between">
    <div className="text-lg font-bold">
      Mehmet IPA <span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs font-normal">{user.username}</span>
    </div>
    <button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button>
  </header>

  <section className="mx-auto mt-10 max-w-xl">
    <h1 className="text-2xl font-bold">İmza yöntemini seç</h1>
    <p className="mt-2 text-sm text-muted-foreground">IPA dosyanı hangi sertifika ile imzalamak istediğini seç.</p>

    <div className="mt-6 grid gap-4">
      <button onClick={() => { setError(''); setView('signer') }} className="rounded-2xl border bg-card p-5 text-left">
        <span className="text-lg font-semibold">Kendi sertifikam</span>
        <span className="mt-2 block text-sm text-muted-foreground">Kendi P12/PFX dosyanı ve provisioning profile dosyanı kullan.</span>
        <span className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Devam et</span>
      </button>

      <div className="rounded-2xl border border-dashed bg-card/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-lg font-semibold">Mehmet IPA VIP</span>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700">Hazırlanıyor</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Merkezi sertifika ve sunucu tarafı imzalama tamamlandığında açılacak.</p>
        <button disabled className="mt-4 rounded-lg border px-4 py-2 text-sm opacity-50">VIP yakında</button>
      </div>
    </div>

    <button onClick={() => setView('home')} className="mt-6 text-sm text-muted-foreground">← Hesabıma dön</button>
  </section>
</Frame>
  if (view === 'signer' && user?.role === 'member') {
    return <><div className="sticky top-0 z-50 flex items-center justify-between border-b bg-background/95 px-4 py-2 backdrop-blur"><div className="text-sm font-semibold">Mehmet IPA <span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs font-normal">{user.username}</span></div><div className="flex gap-2"><button onClick={() => setView('home')} className="rounded-lg border px-3 py-2 text-sm">Hesabım</button><button onClick={logout} className="rounded-lg border px-3 py-2 text-sm">Çıkış</button></div></div><SylvaSigner /></>
  }

  if (view === 'login') return <Frame><section className="mx-auto max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8"><Brand /><h1 className="mt-8 text-2xl font-bold">Hesabına giriş yap</h1><p className="mt-2 text-sm text-muted-foreground">Üyelikler yönetici tarafından oluşturulur. Açık kayıt bulunmuyor.</p><form onSubmit={login} className="mt-6 grid gap-4"><Field label="Kullanıcı adı" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /><Field label="Şifre" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /><ErrorText error={error} /><button disabled={busy} className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button></form><button onClick={() => { setView('home'); setError('') }} className="mt-5 w-full text-sm text-muted-foreground">← Ana sayfa</button></section></Frame>

  if (view === 'admin' && user?.role === 'admin') return <Frame><header className="flex flex-wrap items-center justify-between gap-3"><Brand /><div className="flex gap-2"><button onClick={() => loadAdmin(token).catch(e => setError(e.message))} className="rounded-xl border px-3 py-2 text-sm">Yenile</button><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></div></header><div className="mt-8"><h1 className="text-2xl font-bold">Yönetim paneli</h1><p className="mt-1 text-sm text-muted-foreground">Üye hesapları ve cihaz onayları</p><ErrorText error={error} /><NoticeText notice={notice} /></div><section className="mt-6 rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">VIP sertifikası yükle</h2><p className="mt-1 text-sm text-muted-foreground">P12 ve provisioning profile dosyaları özel R2 kasasına kaydedilir. P12 şifresi sunucuda AES-GCM ile şifrelenir.</p><div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">{certificate ? <><div><strong>Durum:</strong> {certificate.status}</div><div><strong>P12:</strong> {certificate.certificate_name || '—'}</div><div><strong>Profil:</strong> {certificate.profile_name || '—'}</div><div><strong>Bitiş:</strong> {certificate.expires_at || 'Belirtilmedi'}</div></> : 'Henüz sertifika yüklenmedi.'}</div><form onSubmit={uploadCertificate} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">P12 / PFX dosyası<input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setP12File(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label><label className="grid gap-1.5 text-sm font-medium">Provisioning profile<input type="file" accept=".mobileprovision" onChange={e => setProfileFile(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label><Field label="P12 şifresi" type="password" autoComplete="new-password" value={certificatePassword} onChange={e => setCertificatePassword(e.target.value)} required /><Field label="Sertifika bitiş tarihi (isteğe bağlı)" type="date" value={certificateExpiry} onChange={e => setCertificateExpiry(e.target.value)} /><div className="sm:col-span-2"><button disabled={busy || !p12File || !profileFile} className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Yükleniyor…' : 'Sertifikayı güvenli yükle'}</button></div></form></section><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Yeni kullanıcı oluştur</h2><form className="mt-4 grid gap-3" onSubmit={createUser}><Field label="Ad soyad" value={newName} onChange={e => setNewName(e.target.value)} required /><Field label="Kullanıcı adı" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoCapitalize="none" required /><Field label="İlk şifre (en az 8 karakter)" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} /><Field label="Grup" value={newGroup} onChange={e => setNewGroup(e.target.value)} /><button disabled={busy} className="mt-1 h-11 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">Kullanıcı oluştur</button></form></section><section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Kullanıcılar</h2><span className="text-sm text-muted-foreground">{users.length} hesap</span></div><div className="mt-4 grid gap-3">{users.length === 0 ? <p className="text-sm text-muted-foreground">Henüz üye yok.</p> : users.map(item => <article key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{item.name}</div><div className="text-sm text-muted-foreground">@{item.username} · {item.group_name || 'Standart'}</div></div><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{item.status === 'active' ? 'Aktif' : 'Engelli'}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => updateUser(item, { status: item.status === 'active' ? 'blocked' : 'active' })} className="rounded-lg border px-3 py-2 text-xs">{item.status === 'active' ? 'Engelle' : 'Engeli kaldır'}</button><button onClick={() => { const group = window.prompt('Yeni grup adı:', item.group_name || 'Standart'); if (group !== null) updateUser(item, { group_name: group }) }} className="rounded-lg border px-3 py-2 text-xs">Grubu değiştir</button><button onClick={() => deleteUser(item)} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Sil</button></div></article>)}</div></section></div><section className="mt-6 rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">UDID kayıtları / yönetimi</h2><span className="text-sm text-muted-foreground">{devices.length} cihaz</span></div><p className="mt-2 text-xs text-muted-foreground">Not: Safari UDID değerini otomatik doğrulayamaz; bu ekrandaki durumlar şu an kayıt ve takip amaçlıdır.</p><div className="mt-4 grid gap-3">{devices.length === 0 ? <p className="text-sm text-muted-foreground">Bekleyen cihaz kaydı yok.</p> : devices.map(device => <article key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="font-medium">{device.name || device.username || 'Üye'} · <span className="font-normal text-muted-foreground">{device.udid}</span></div><div className="text-xs text-muted-foreground">Durum: {device.status}</div></div><div className="flex flex-wrap gap-2"><button onClick={() => updateDevice(device, 'approved')} className="rounded-lg border px-3 py-2 text-xs">Onayla</button><button onClick={() => updateDevice(device, 'pending')} className="rounded-lg border px-3 py-2 text-xs">Beklet</button><button onClick={() => updateDevice(device, 'blocked')} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Engelle</button></div></article>)}</div></section></Frame>

  if (view === 'home' && user?.role === 'member') return <Frame><header className="flex items-center justify-between"><Brand /><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></header><section className="mx-auto mt-10 max-w-xl rounded-3xl border bg-card p-6"><h1 className="text-2xl font-bold">Merhaba, {user.name}</h1><p className="mt-2 text-sm text-muted-foreground">Hesabın aktif. Kayıtlı cihazlarını buradan yönetebilirsin.</p><p className="mt-2 text-xs text-muted-foreground">UDID kaydı Safari tarafından otomatik doğrulanmaz; yönetici onayı şu an kayıt takibi içindir.</p><form onSubmit={registerDevice} className="mt-6 grid gap-3"><Field label="Cihaz UDID" value={udid} onChange={e => setUdid(e.target.value)} placeholder="UDID değerini gir" required /><button disabled={busy} className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground">Cihazı onaya gönder</button></form><div className="mt-5 grid gap-2">{myDevices.map(d => <div key={d.id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span className="break-all">{d.udid}</span><span>{d.status === 'approved' ? 'Onaylandı' : d.status === 'blocked' ? 'Engellendi' : 'Bekliyor'}</span></div>)}</div><button onClick={() => setView('signer')} className="mt-6 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">İmzalama ekranını aç</button></section></Frame>

  return <Frame>
    <section className="mx-auto max-w-3xl pt-2">
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Mehmet IPA VIP</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">VIP Paket Fiyatları</h2>
        <p className="mt-2 text-sm text-muted-foreground">İhtiyacına uygun süreyi seç.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground">1 Ay</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">450 TL</p>
        </article>
        <article className="rounded-2xl border-2 border-primary bg-card p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-primary">3 Ay</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">800 TL</p>
          <p className="mt-1 text-xs text-muted-foreground">Avantajlı paket</p>
        </article>
        <article className="rounded-2xl border bg-card p-5 text-center">
          <p className="text-sm text-muted-foreground">6 Ay</p>
          <p className="mt-2 text-3xl font-bold tabular-nums">1.500 TL</p>
        </article>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">VIP hizmeti ve ödeme sistemi henüz hazırlanıyor. Paket satışı aktif değildir.</p>
    </section>
    <section className="mx-auto max-w-xl pt-8 text-center sm:pt-12"><Brand /><div className="mt-10 rounded-3xl border bg-card p-6 shadow-sm sm:p-10"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-2xl font-bold">IPA</div><h1 className="mt-6 text-3xl font-bold tracking-tight">Mehmet IPA</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">iOS IPA dosyalarını tarayıcı üzerinden imzalama aracı. Üyeler giriş yaparak imzalama ekranına erişebilir.</p>{!isInstalledApp && <a href={APP_DOWNLOAD} className="mt-7 flex h-12 w-full items-center justify-center rounded-xl border font-semibold">Mehmet IPA uygulamasını indir</a>}<button onClick={() => { setView('login'); setError('') }} className="mt-3 h-12 w-full rounded-xl bg-primary font-semibold text-primary-foreground">Üye / Yönetici girişi</button><p className="mt-5 text-xs text-muted-foreground">Yeni üyelik oluşturma kapalıdır. Hesaplar yönetici tarafından tanımlanır.</p></div><p className="mt-6 text-xs text-muted-foreground">© Mehmet IPA</p></section></Frame>
}

function ErrorText({ error }: { error: string }) { return error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p> : null }
function NoticeText({ notice }: { notice: string }) { return notice ? <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null }
