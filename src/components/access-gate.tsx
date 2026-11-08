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
  email?: string
}
type RegistrationRequest = { id:string; name:string; username:string; email:string; status:string; created_at:string; verified_at?:string|null }
type PresenceUser = { id:string; name:string; username:string; last_seen_at?:string|null; device_label?:string|null; browser_label?:string|null; online:boolean }
type Device = {
  id: string
  user_id?: string
  name?: string
  username?: string
  udid: string
  status: 'pending' | 'approved' | 'blocked'
  created_at?: string
}

function getAppLocale() {
  return typeof window !== 'undefined' && window.localStorage.getItem('mehmetipa.language') === 'en' ? 'en-US' : 'tr-TR'
}

const TOKEN_KEY = 'mehmetipa.session.v1'
const APP_VERSION = '0.1.0'
const APP_DOWNLOAD = 'https://github.com/mehmet4665/mehmetipa-signer/releases/download/latest/Mehmet-IPA-iOS.ipa'
const UPDATE_MANIFEST = 'https://mehmetipa-signer.pages.dev/app-update.json'
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


function GameDevicePower({ level, recommended }: { level: number; recommended: string }) {
  const models = [
    { name: 'iPhone 13', chip: 'A15', power: 1 },
    { name: 'iPhone 14', chip: 'A15', power: 2 },
    { name: 'iPhone 15', chip: 'A16', power: 3 },
    { name: 'iPhone 16', chip: 'A18', power: 4 },
    { name: 'iPhone 17', chip: 'A19', power: 5 },
    { name: 'iPhone 18 Pro', chip: 'A20 Pro', power: 6 },
  ]
  return <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
    <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tahmini cihaz seviyesi</span><span className="text-[10px] font-bold text-cyan-200">{recommended}</span></div>
    <div className="mt-2 grid grid-cols-3 gap-1.5">
      {models.map((model, index) => <div key={model.name} className={`rounded-lg border px-1 py-1.5 text-center ${model.power >= level ? 'border-emerald-400/20 bg-emerald-400/[0.07]' : 'border-amber-400/15 bg-amber-400/[0.05]'}`}>
        <div className="text-[10px] font-bold text-slate-200">{model.name}</div>
        <div className="mt-0.5 text-[9px] text-slate-500">{model.chip}</div>
        <div className="mt-0.5 text-[11px] tracking-[-2px]" aria-label={`Güç seviyesi ${index + 1} / 6`}>{'⚡'.repeat(index + 1)}</div>
      </div>)}
    </div>
  </div>
}

type PublicGame = { title: string; image: string; genre: string; platform: string; platformType: 'switch' | 'cloud' | 'other' }

const PUBLIC_GAMES: PublicGame[] = [
  { title: 'Dark Souls Remastered', image: '570940', genre: 'Soulslike · Aksiyon RPG', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Prince of Persia: The Lost Crown', image: '2751000', genre: 'Aksiyon · Metroidvania', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Mortal Kombat 11', image: '976310', genre: 'Dövüş · Aksiyon', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Grand Theft Auto V', image: '271590', genre: 'Açık dünya · Aksiyon', platform: 'Switch sürümü yok', platformType: 'other' },
  { title: 'Hades', image: '1145360', genre: 'Aksiyon · Roguelike', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Hollow Knight', image: '367520', genre: 'Metroidvania · Macera', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Cuphead', image: '268910', genre: 'Platform · Boss savaşı', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Stardew Valley', image: '413150', genre: 'Çiftçilik · Yaşam', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Dead Cells', image: '588650', genre: 'Aksiyon · Roguelite', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Celeste', image: '504230', genre: 'Platform · Zorlu macera', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'The Witcher 3: Wild Hunt', image: '292030', genre: 'Açık dünya · RPG', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Ori and the Blind Forest', image: '261570', genre: 'Platform · Hikâye', platform: 'Switch sürümü var', platformType: 'switch' },
]

const RESIDENT_EVIL_GAMES: PublicGame[] = [
  { title: 'Resident Evil 4 Remake', image: '2050650', genre: 'Survival horror · Remake', platform: 'Switch sürümü yok', platformType: 'other' },
  { title: 'Resident Evil 2 Remake', image: '883710', genre: 'Survival horror · Remake', platform: 'Switch sürümü yok', platformType: 'other' },
  { title: 'Resident Evil 3 Remake', image: '952060', genre: 'Survival horror · Remake', platform: 'Switch sürümü yok', platformType: 'other' },
  { title: 'Resident Evil 7: Biohazard', image: '418370', genre: 'Survival horror', platform: 'Switch bulut sürümü · bölgeye bağlı', platformType: 'cloud' },
  { title: 'Resident Evil Village', image: '1196590', genre: 'Survival horror · Aksiyon', platform: 'Switch bulut sürümü · bölgeye bağlı', platformType: 'cloud' },
  { title: 'Resident Evil 5', image: '21690', genre: 'Aksiyon · Co-op', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Resident Evil 6', image: '221040', genre: 'Aksiyon · Co-op', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Resident Evil Revelations', image: '222480', genre: 'Survival horror', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Resident Evil Revelations 2', image: '287290', genre: 'Survival horror · Bölümlü', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Resident Evil 0 HD Remaster', image: '339340', genre: 'Survival horror · Klasik', platform: 'Switch sürümü var', platformType: 'switch' },
  { title: 'Resident Evil HD Remaster', image: '304240', genre: 'Survival horror · Klasik', platform: 'Switch sürümü var', platformType: 'switch' },
]

function PublicGameCard({ game }: { game: PublicGame }) {
  return <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]">
    <img src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.image}/header.jpg`} alt={`${game.title} kapak görseli`} loading="lazy" className="aspect-[16/9] w-full object-cover" />
    <div className="p-3">
      <h3 className="text-sm font-bold leading-5">{game.title}</h3>
      <p className="mt-1 text-xs text-slate-400">{game.genre}</p>
    </div>
  </article>
}

export function AccessGate() {
  const [token, setToken] = React.useState('')
  const [user, setUser] = React.useState<User | null>(null)
  const [view, setView] = React.useState<'home' | 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'admin' | 'method' | 'signer'>(() => typeof window !== 'undefined' ? (window.location.pathname === '/verify-email' ? 'verify' : window.location.pathname === '/reset-password' ? 'reset' : 'home') : 'home')
  const [loginMode, setLoginMode] = React.useState<'member' | 'admin'>('member')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [registrationRequests, setRegistrationRequests] = React.useState<RegistrationRequest[]>([])
  const [registerName, setRegisterName] = React.useState('')
  const [registerUsername, setRegisterUsername] = React.useState('')
  const [registerEmail, setRegisterEmail] = React.useState('')
  const [registerPassword, setRegisterPassword] = React.useState('')
  const [registerPasswordAgain, setRegisterPasswordAgain] = React.useState('')
  const [forgotEmail, setForgotEmail] = React.useState('')
  const [resetPasswordValue, setResetPasswordValue] = React.useState('')
  const [resetPasswordAgain, setResetPasswordAgain] = React.useState('')
  const [resetToken, setResetToken] = React.useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [users, setUsers] = React.useState<User[]>([])
  const [devices, setDevices] = React.useState<Device[]>([])
  const [presenceUsers, setPresenceUsers] = React.useState<PresenceUser[]>([])
  const [newName, setNewName] = React.useState('')
  const [newUsername, setNewUsername] = React.useState('')
  const [newEmail, setNewEmail] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [newGroup, setNewGroup] = React.useState('Standart')
  const [udid, setUdid] = React.useState('')
  const [myDevices, setMyDevices] = React.useState<Device[]>([])
  const [memberTab, setMemberTab] = React.useState<'games' | 'ipa' | 'account' | 'settings'>('games')
  const [certificate, setCertificate] = React.useState<{status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null>(null)
  const [p12File, setP12File] = React.useState<File|null>(null)
  const [profileFile, setProfileFile] = React.useState<File|null>(null)
  const [certificatePassword, setCertificatePassword] = React.useState('')
  const [certificateExpiry, setCertificateExpiry] = React.useState('')
  const [currentLocation, setCurrentLocation] = React.useState(() => typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.hash}`)
  const isPublicDocument = currentLocation === '/privacy' || currentLocation === '/legal' || currentLocation.endsWith('#privacy') || currentLocation.endsWith('#legal')

  React.useEffect(() => {
    document.body.dataset.appView = view === 'method' ? 'method' : view === 'home' ? 'home' : view
  }, [view, memberTab])

  React.useEffect(() => {
    const updateLocation = () => setCurrentLocation(`${window.location.pathname}${window.location.hash}`)
    window.addEventListener('hashchange', updateLocation)
    window.addEventListener('popstate', updateLocation)
    return () => { window.removeEventListener('hashchange', updateLocation); window.removeEventListener('popstate', updateLocation) }
  }, [])

  const loadAdmin = React.useCallback(async (activeToken: string) => {
    const [u, d, c, p, r] = await Promise.all([
      api<{ users: User[] }>('/api/admin/users', activeToken),
      api<{ devices: Device[] }>('/api/admin/devices', activeToken),
      api<{ certificate: {status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null }>('/api/admin/certificate', activeToken),
      api<{ users: PresenceUser[] }>('/api/admin/presence', activeToken),
      api<{ requests: RegistrationRequest[] }>('/api/admin/registration-requests', activeToken),
    ])
    setUsers(u.users || [])
    setDevices(d.devices || [])
    setCertificate(c.certificate)
    setPresenceUsers(p.users || [])
    setRegistrationRequests(r.requests || [])
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


  React.useEffect(() => {
    if (!token || !user || user.role !== 'member' || view === 'login' || view === 'home') return
    const sendHeartbeat = () => api('/api/presence/heartbeat', token, { method: 'POST', body: '{}' }).catch(() => {})
    sendHeartbeat()
    const timer = window.setInterval(sendHeartbeat, 30000)
    return () => window.clearInterval(timer)
  }, [token, user, view])

  React.useEffect(() => {
    if (!token || user?.role !== 'admin' || view !== 'admin') return
    const timer = window.setInterval(() => loadAdmin(token).catch(() => {}), 30000)
    return () => window.clearInterval(timer)
  }, [token, user, view, loadAdmin])

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
      if (loginMode === 'admin' && result.user.role !== 'admin') throw new Error('Bu giriş yalnızca yönetici hesapları içindir.')
      if (loginMode === 'member' && result.user.role === 'admin') throw new Error('Yönetici hesabı için yönetici girişini seç.')
      window.sessionStorage.setItem(TOKEN_KEY, result.token)
      setToken(result.token); setUser(result.user)
      setView(result.user.role === 'admin' ? 'admin' : 'method')
      setPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Giriş başarısız.') }
    finally { setBusy(false) }
  }

  const register = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    if (registerPassword !== registerPasswordAgain) { setBusy(false); setError('Şifreler eşleşmiyor.'); return }
    try { const result=await api<{message:string}>('/api/auth/register',undefined,{method:'POST',body:JSON.stringify({name:registerName,username:registerUsername,email:registerEmail,password:registerPassword})}); setNotice(result.message || 'Başvurun yönetici onayına gönderildi.'); setError(''); setRegisterPassword(''); setRegisterPasswordAgain('') }
    catch(e) { setError(e instanceof Error ? e.message : 'Başvuru gönderilemedi.') } finally { setBusy(false) }
  }
  const requestPasswordReset = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { const result=await api<{message:string}>('/api/auth/forgot-password',undefined,{method:'POST',body:JSON.stringify({email:forgotEmail})}); setNotice(result.message) } catch(e) { setError(e instanceof Error ? e.message : 'İstek gönderilemedi.') } finally { setBusy(false) } }
  const resetPassword = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); if(resetPasswordValue!==resetPasswordAgain){setBusy(false);setError('Şifreler eşleşmiyor.');return} try { const result=await api<{message:string}>('/api/auth/reset-password',undefined,{method:'POST',body:JSON.stringify({token:resetToken,password:resetPasswordValue})}); setNotice(result.message); setResetPasswordValue('');setResetPasswordAgain('') } catch(e) { setError(e instanceof Error ? e.message : 'Şifre yenilenemedi.') } finally { setBusy(false) } }
  const verifyRegistrationEmail = React.useCallback(async () => { if (!resetToken) { const token=new URLSearchParams(window.location.search).get('token') || ''; if (!token) { setError('Doğrulama bağlantısı bulunamadı.'); return } setResetToken(token); try { const result=await api<{message:string}>('/api/auth/verify-email',undefined,{method:'POST',body:JSON.stringify({token})}); setNotice(result.message) } catch(e) { setError(e instanceof Error ? e.message : 'E-posta doğrulanamadı.') } } else { try { const result=await api<{message:string}>('/api/auth/verify-email',undefined,{method:'POST',body:JSON.stringify({token:resetToken})}); setNotice(result.message) } catch(e) { setError(e instanceof Error ? e.message : 'E-posta doğrulanamadı.') } } },[resetToken])
  React.useEffect(() => {
    if (view === 'verify') verifyRegistrationEmail().catch(() => {})
  }, [view, verifyRegistrationEmail])

  const reviewRegistration = async (request: RegistrationRequest, action: 'approve'|'reject'|'reopen') => { if(!token)return; setError('');setNotice('');try{await api('/api/admin/registration-requests/'+encodeURIComponent(request.id),token,{method:'POST',body:JSON.stringify({action})});await loadAdmin(token);setNotice(action==='approve'?'Başvuru kabul edildi, hesap açıldı.':action==='reject'?'Başvuru reddedildi.':'Başvuru yeniden incelemeye alındı.')}catch(e){setError(e instanceof Error?e.message:'Başvuru işlenemedi.')} }
  const logout = () => {
    window.sessionStorage.removeItem(TOKEN_KEY)
    setToken(''); setUser(null); setUsers([]); setDevices([]); setMyDevices([]); setView('home'); setError(''); setNotice('')
  }

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault(); if (!token) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/users', token, { method: 'POST', body: JSON.stringify({ name: newName, username: newUsername, email: newEmail, password: newPassword, group_name: newGroup }) })
      setNewName(''); setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewGroup('Standart')
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
    const isEnglish = window.localStorage.getItem('mehmetipa.language') === 'en'; const message = isEnglish ? `Delete the ${target.username} account and its device registrations?` : `${target.username} hesabı ve cihaz kayıtları silinsin mi?`; if (!token || !window.confirm(message)) return
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
  const [availableUpdate, setAvailableUpdate] = React.useState<{ version: string; ipaUrl: string; notes?: string } | null>(null)

  React.useEffect(() => {
    if (!isInstalledApp) return
    let active = true
    fetch(`${UPDATE_MANIFEST}?t=${Date.now()}`, { cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then((manifest: { version?: string; ipaUrl?: string; notes?: string } | null) => {
        if (!active || !manifest?.version || !manifest.ipaUrl) return
        const current = APP_VERSION.split('.').map(Number)
        const latest = manifest.version.split('.').map(Number)
        const isNewer = latest.some((part, index) => part > (current[index] || 0) &&
          latest.slice(0, index).every((value, prior) => value === (current[prior] || 0)))
        if (isNewer) setAvailableUpdate({ version: manifest.version, ipaUrl: manifest.ipaUrl, notes: manifest.notes })
      })
      .catch(() => {})
    return () => { active = false }
  }, [isInstalledApp])

  if (isPublicDocument) return <SylvaSigner />
if (view === 'method' && user?.role === 'member') return <main className="relative min-h-screen bg-[#080B18] px-4 pb-28 pt-5 text-white sm:px-6">
  <div aria-hidden="true" className="pointer-events-none fixed -right-32 top-20 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />
  <div className="relative mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 backdrop-blur-xl">
      <div className="flex items-center gap-3"><img src="/icon-dark-512.PNG" alt="Mehmet IPA" className="h-10 w-10 rounded-xl" /><div><div className="font-bold">Mehmet IPA</div><div className="text-xs text-slate-400">Oyuncu merkezi</div></div></div>
      <div className="flex flex-wrap items-center gap-2"><div id="language-picker-slot" className="shrink-0" /><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">● Hesap aktif</span></div>
    </header>
    {isInstalledApp && availableUpdate && <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
      <div><div className="font-semibold text-cyan-100">Yeni sürüm mevcut · v{availableUpdate.version}</div><p className="mt-1 text-sm text-slate-300">{availableUpdate.notes || 'Mehmet IPA’nın yeni sürümü hazır.'}</p></div>
      <a href={availableUpdate.ipaUrl} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">IPA’yı Güncelle</a>
    </section>}
    {memberTab === 'games' && <div className="mt-6">
      <section className="overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-600/25 via-indigo-600/15 to-cyan-500/10 p-6 sm:p-9"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200">Oyun dünyası</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Hoş geldin, {user.name}!</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Emülatör oyunlarını keşfet, rehberlere göz at ve yeni oyun deneyimlerine hazırlan.</p><a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold">✈️ Telegram destek</a></section>
      <div className="mb-4 mt-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">Oyun koleksiyonu</p><h2 className="mt-2 text-2xl font-extrabold">Öne çıkan oyunlar</h2><p className="mt-1 text-sm text-slate-400">Switch sürümü bulunan sevilen oyunlar ve rehberleri</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/570940/header.jpg" alt="Dark Souls Remastered kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Dark Souls Remastered</h3><p className="mt-1 text-xs text-slate-400">Soulslike · Aksiyon RPG</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={4} recommended="iPhone 16 ve üzeri · ağır oyun" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/2751000/header.jpg" alt="Prince of Persia The Lost Crown kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Prince of Persia: The Lost Crown</h3><p className="mt-1 text-xs text-slate-400">Aksiyon · Metroidvania</p><span className="mt-2 inline-block text-[11px] text-cyan-200">Switch sürümü var</span><GameDevicePower level={3} recommended="iPhone 15 ve üzeri · tahmini" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/976310/header.jpg" alt="Mortal Kombat 11 kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Mortal Kombat 11</h3><p className="mt-1 text-xs text-slate-400">Dövüş · Aksiyon</p><span className="mt-2 inline-block text-[11px] text-amber-200">Switch sürümü var</span><GameDevicePower level={4} recommended="iPhone 16 ve üzeri · ağır oyun" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/271590/header.jpg" alt="Grand Theft Auto V kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Grand Theft Auto V</h3><p className="mt-1 text-xs text-slate-400">Açık dünya · Aksiyon</p><span className="mt-2 inline-block text-[11px] text-amber-200">Switch sürümü yok · ayrı platform</span><GameDevicePower level={6} recommended="MeloNX Switch oyunu değil" /></div></article>

        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg" alt="Hades kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Hades</h3><p className="mt-1 text-xs text-slate-400">Aksiyon · Roguelike</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={1} recommended="iPhone 13 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/367520/header.jpg" alt="Hollow Knight kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Hollow Knight</h3><p className="mt-1 text-xs text-slate-400">Metroidvania · Macera</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={1} recommended="iPhone 13 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/268910/header.jpg" alt="Cuphead kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Cuphead</h3><p className="mt-1 text-xs text-slate-400">Platform · Boss savaşı</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={1} recommended="iPhone 13 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg" alt="Stardew Valley kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Stardew Valley</h3><p className="mt-1 text-xs text-slate-400">Çiftçilik · Yaşam</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={1} recommended="iPhone 13 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/588650/header.jpg" alt="Dead Cells kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Dead Cells</h3><p className="mt-1 text-xs text-slate-400">Aksiyon · Roguelite</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={2} recommended="iPhone 14 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/504230/header.jpg" alt="Celeste kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Celeste</h3><p className="mt-1 text-xs text-slate-400">Platform · Zorlu macera</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={1} recommended="iPhone 13 ve üzeri" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/292030/header.jpg" alt="The Witcher 3 Wild Hunt kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">The Witcher 3</h3><p className="mt-1 text-xs text-slate-400">Açık dünya · RPG</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={4} recommended="iPhone 16 ve üzeri · ağır oyun" /></div></article>
        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><img src="https://cdn.cloudflare.steamstatic.com/steam/apps/261570/header.jpg" alt="Left 4 Dead 2 kapak görseli" loading="lazy" className="aspect-[16/9] w-full object-cover" /><div className="p-3"><h3 className="font-bold text-sm">Ori and the Blind Forest</h3><p className="mt-1 text-xs text-slate-400">Platform · Hikâye</p><span className="mt-2 inline-block text-[11px] text-violet-200">Switch sürümü var</span><GameDevicePower level={2} recommended="iPhone 14 ve üzeri" /></div></article>
      </div>
      <p className="mt-3 text-xs text-slate-500">Güç göstergesi Apple çip nesillerine göre hazırlanmış yaklaşık donanım sıralamasıdır; yeşil alan önerilen seviyeyi, ⚡ sayısı nesiller arası göreceli güç artışını gösterir. Bunlar kesin FPS veya doğrulanmış MeloNX uyumluluk garantisi değildir. Gerçek sonuç emülatör sürümüne, oyun sürümüne, RAM'e ve ısınmaya göre değişir. Kapak görselleri tanıtım amaçlıdır.</p>
    </div>}
    {memberTab === 'ipa' && <section className="mt-8 rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-600/20 to-indigo-600/10 p-6 sm:p-9"><div className="text-4xl">✍️</div><h1 className="mt-3 text-3xl font-black">IPA imzalama</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">IPA dosyanı kendi sertifikan ve provisioning profile dosyanla imzalama ekranına geç.</p><button onClick={() => { setError(''); setView('signer') }} className="mt-6 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 font-bold">İmzalama merkezini aç →</button></section>}
    {memberTab === 'account' && <section className="mt-8 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><h1 className="text-2xl font-black">Hesabım</h1><p className="mt-3 text-sm text-slate-300">{user.name}</p><p className="text-sm text-slate-400">@{user.username}</p><div className="mt-4 inline-flex rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">Hesap durumu: Aktif</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><h2 className="font-bold">Cihaz kaydı</h2><form onSubmit={registerDevice} className="mt-4 grid gap-3"><Field label="Cihaz UDID" value={udid} onChange={e => setUdid(e.target.value)} placeholder="UDID değerini gir" required /><button disabled={busy} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-semibold">Cihazı onaya gönder</button></form><div className="mt-4 grid gap-2">{myDevices.map(d => <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/20 p-3 text-xs"><span className="break-all text-slate-300">{d.udid}</span><span className="shrink-0 text-slate-400">{d.status === 'approved' ? 'Onaylandı' : d.status === 'blocked' ? 'Engellendi' : 'Bekliyor'}</span></div>)}</div></div></section>}
    {memberTab === 'settings' && <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.045] p-6"><h1 className="text-2xl font-black">Ayarlar</h1><p className="mt-2 text-sm text-slate-400">Hesap ve destek işlemleri</p><a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">Telegram destek <span>↗</span></a><a href="https://www.tiktok.com/@m3hm3t_m" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">TikTok · @m3hm3t_m <span>↗</span></a><button onClick={logout} className="mt-6 w-full rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200">Çıkış yap</button></section>}
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090D1B]/95 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
      {([{id:'games',label:'Games',icon:'🎮'},{id:'ipa',label:'IPA',icon:'✍️'},{id:'account',label:'Hesabım',icon:'👤'},{id:'settings',label:'Ayarlar',icon:'⚙️'}] as const).map(tab => <button key={tab.id} onClick={() => setMemberTab(tab.id)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${memberTab === tab.id ? 'bg-violet-500/20 text-violet-200' : 'text-slate-400 hover:bg-white/5'}`}><span className="text-lg">{tab.icon}</span>{tab.label}</button>)}
    </div></nav>
  </div>
</main>
  if (view === 'signer' && user?.role === 'member') {
    return <><div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur sm:px-4"><div className="text-sm font-semibold">Mehmet IPA <span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs font-normal">{user.username}</span></div><div className="flex items-center gap-2"><button onClick={() => { setView('method'); setMemberTab('games') }} className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200 sm:text-sm">⌂ Ana sayfaya dön</button><button onClick={logout} className="rounded-lg border px-3 py-2 text-xs sm:text-sm">Çıkış</button></div></div><SylvaSigner /></>
  }

  if (view === 'login') return <main className="auth-screen-enter relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B18] px-4 py-10 text-white"><style>{`@keyframes authScreenEnter{0%{opacity:0;transform:translateY(20px) scale(.985);filter:blur(5px)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}.auth-screen-enter{animation:authScreenEnter .48s cubic-bezier(.2,.75,.25,1) both}.auth-panel{box-shadow:0 32px 100px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.06)}@media(prefers-reduced-motion:reduce){.auth-screen-enter{animation:none}}`}</style>
    <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-10 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
    <div className="auth-panel relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111526]/95 ring-1 ring-white/[0.06] backdrop-blur-2xl lg:grid-cols-[1fr_.9fr]">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-cyan-500/10 p-10 lg:flex"><div><Brand /><p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Mehmet IPA üyelik</p><h1 className="mt-4 text-4xl font-black leading-tight">Oyun ve imzalama dünyana hoş geldin.</h1><p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">Hesabına giriş yap; IPA imzalama araçlarına, oyun vitrinine ve Türkçe emülatör rehberlerine ulaş.</p></div><div className="grid grid-cols-3 gap-3"><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">🎮</div><div className="mt-1 text-xs text-slate-300">Oyunlar</div></div><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">🔐</div><div className="mt-1 text-xs text-slate-300">Sertifikalar</div></div><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">⚡</div><div className="mt-1 text-xs text-slate-300">IPA imzalama</div></div></div></div>
      <section className="p-6 sm:p-10"><div className="lg:hidden"><Brand /></div><div className="mt-8 lg:mt-4"><div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${loginMode === 'admin' ? 'border-amber-300/25 bg-amber-400/10 text-amber-200' : 'border-violet-300/20 bg-violet-400/10 text-violet-200'}`}>{loginMode === 'admin' ? 'YÖNETİCİ GİRİŞİ' : 'ÜYE GİRİŞİ'}</div><h2 className="mt-4 text-3xl font-black tracking-tight">{loginMode === 'admin' ? 'Yönetim paneline hoş geldin.' : 'Tekrar hoş geldin.'}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{loginMode === 'admin' ? 'Yönetici hesabınla güvenli şekilde devam et.' : 'Devam etmek için hesap bilgilerini gir.'}</p><div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={()=>{setLoginMode('member');setError('')}} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${loginMode==='member' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>Üye girişi</button><button type="button" onClick={()=>{setLoginMode('admin');setError('')}} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${loginMode==='admin' ? 'bg-amber-500/90 text-[#17120a]' : 'text-slate-400 hover:text-white'}`}>Yönetici</button></div></div><form onSubmit={login} className="mt-7 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-200">Kullanıcı adı<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required placeholder="Kullanıcı adın" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">Şifre<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Şifren" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" /></label><ErrorText error={error} /><button disabled={busy} className="mt-2 h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 font-bold text-white shadow-lg shadow-violet-950/40 transition hover:brightness-110 disabled:opacity-50">{busy ? 'Giriş yapılıyor…' : 'Güvenli giriş yap →'}</button></form><div className="mt-5 flex flex-wrap justify-center gap-4 text-xs"><button type="button" onClick={() => {setView('register');setError('');setNotice('')}} className="font-semibold text-violet-300 hover:text-white">Hesap oluştur</button><button type="button" onClick={() => {setView('forgot');setError('');setNotice('')}} className="text-slate-400 hover:text-white">Şifremi unuttum</button></div><button onClick={() => { setView('home'); setError('') }} className="mt-6 w-full text-sm text-slate-400 transition hover:text-white">← Ana sayfaya dön</button></section>
    </div>
  </main>


  if (view === 'register') return <main className="auth-screen-enter relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B18] px-4 py-10 text-white"><section className="auth-panel relative w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#111526]/95 p-6 ring-1 ring-white/[0.06] sm:p-9"><Brand /><div className="mt-8"><div className="text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Yeni üyelik</div><h1 className="mt-3 text-3xl font-black">Aramıza katıl</h1><p className="mt-2 text-sm leading-6 text-slate-400">Başvurunu gönder. Yönetici onayından sonra hesabın aktif olacak.</p></div><form onSubmit={register} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-200">Ad soyad<input value={registerName} onChange={e=>setRegisterName(e.target.value)} required maxLength={80} autoComplete="name" placeholder="Ad Soyad" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none focus:border-violet-400" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">Kullanıcı adı<input value={registerUsername} onChange={e=>setRegisterUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={40} autoCapitalize="none" autoComplete="username" pattern="[a-z0-9._-]{3,40}" placeholder="kullaniciadi" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none focus:border-violet-400" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">E-posta adresi<input type="email" value={registerEmail} onChange={e=>setRegisterEmail(e.target.value)} required autoComplete="email" placeholder="ornek@mail.com" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none focus:border-violet-400" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">Şifre<input type="password" value={registerPassword} onChange={e=>setRegisterPassword(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="En az 8 karakter" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none focus:border-violet-400" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">Şifre tekrar<input type="password" value={registerPasswordAgain} onChange={e=>setRegisterPasswordAgain(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" placeholder="Şifreni tekrar gir" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none focus:border-violet-400" /></label><div className="rounded-xl border border-violet-300/20 bg-violet-400/10 p-3 text-xs leading-5 text-violet-100">Başvurun yönetici tarafından incelenecek. Onaylandığında hesabınla giriş yapabilirsin.</div><ErrorText error={error}/><NoticeText notice={notice}/><button disabled={busy} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">{busy?'Başvuru gönderiliyor…':'Üyelik başvurusu gönder →'}</button></form><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400 hover:text-white">Zaten hesabın var mı? Giriş yap</button></section></main>

  if (view === 'forgot') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 sm:p-9"><Brand/><h1 className="mt-8 text-3xl font-black">Şifremi unuttum</h1><p className="mt-2 text-sm leading-6 text-slate-400">Hesabına bağlı e-posta adresini gir. Sıfırlama bağlantısı göndereceğiz.</p><form onSubmit={requestPasswordReset} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold">E-posta<input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} required autoComplete="email" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><ErrorText error={error}/><NoticeText notice={notice}/><button disabled={busy} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">{busy?'Gönderiliyor…':'Sıfırlama bağlantısı gönder'}</button></form><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400">← Girişe dön</button></section></main>

  if (view === 'reset') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 sm:p-9"><Brand/><h1 className="mt-8 text-3xl font-black">Yeni şifre belirle</h1><form onSubmit={resetPassword} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold">Yeni şifre<input type="password" value={resetPasswordValue} onChange={e=>setResetPasswordValue(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><label className="grid gap-2 text-sm font-semibold">Yeni şifre tekrar<input type="password" value={resetPasswordAgain} onChange={e=>setResetPasswordAgain(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><ErrorText error={error}/><NoticeText notice={notice}/><button disabled={busy||!resetToken} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">Şifremi yenile</button></form><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400">Girişe dön</button></section></main>

  if (view === 'verify') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8 text-center"><Brand/><h1 className="mt-8 text-2xl font-black">E-posta doğrulama</h1><p className="mt-3 text-sm text-slate-300">Bağlantın kontrol ediliyor…</p><ErrorText error={error}/><NoticeText notice={notice}/><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 font-bold">Giriş ekranına dön</button></section></main>

  if (view === 'admin' && user?.role === 'admin') return <Frame><header className="flex flex-wrap items-center justify-between gap-3"><Brand /><div className="flex flex-wrap items-center gap-2"><div id="language-picker-slot" className="shrink-0" /><button onClick={() => loadAdmin(token).catch(e => setError(e.message))} className="rounded-xl border px-3 py-2 text-sm">Yenile</button><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></div></header><div className="mt-8"><h1 className="text-2xl font-bold">Yönetim paneli</h1><p className="mt-1 text-sm text-muted-foreground">Üye hesapları ve cihaz onayları</p><ErrorText error={error} /><NoticeText notice={notice} /></div>
<section className="mt-6 rounded-2xl border border-violet-500/20 bg-card p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Üyelik başvuruları</h2><p className="mt-1 text-xs text-muted-foreground">Yeni üyelik başvuruları burada yönetici onayını bekler.</p></div><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700">{registrationRequests.filter(item=>item.status==='pending').length} onay bekliyor</span></div>
  <div className="mt-4 grid gap-3">{registrationRequests.filter(item=>item.status==='pending').length===0 ? <p className="text-sm text-muted-foreground">Bekleyen başvuru yok.</p> : registrationRequests.filter(item=>item.status==='pending').map(item=><article key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{item.name}</div><div className="text-sm text-muted-foreground">@{item.username}</div><div className="text-sm text-muted-foreground">{item.email}</div><div className="mt-1 text-xs text-muted-foreground">Başvuru: {new Date(item.created_at).toLocaleString(getAppLocale())}</div></div><span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700">Onay bekliyor</span></div><div className="mt-3 flex gap-2"><button onClick={()=>reviewRegistration(item,'approve')} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Kabul et</button><button onClick={()=>reviewRegistration(item,'reject')} className="rounded-lg border border-red-500/30 px-4 py-2 text-xs font-semibold text-red-600">Reddet</button></div></article>)}</div>
  <div className="mt-4 border-t pt-3"><div className="text-xs font-semibold text-muted-foreground">Reddedilen başvurular</div><div className="mt-2 grid gap-2">{registrationRequests.filter(item=>item.status==='rejected').map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs"><span>{item.name} · @{item.username} · {item.email}</span><div className="flex items-center gap-2"><span className="text-red-600">Reddedildi</span><button onClick={()=>reviewRegistration(item,'reopen')} className="rounded border px-2 py-1 text-[11px]">Yeniden incele</button></div></div>)}</div></div>
  <div className="mt-4 border-t pt-3"><div className="text-xs font-semibold text-muted-foreground">E-posta doğrulaması bekleyen başvurular</div><div className="mt-2 grid gap-2">{registrationRequests.filter(item=>item.status==='verification_pending').map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs"><span>{item.name} · {item.email}</span><span className="text-amber-700">Doğrulama bekliyor</span></div>)}</div></div>
</section>
<section className="mt-6 grid gap-3 sm:grid-cols-3">
  <div className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">Toplam üye</p><p className="mt-1 text-2xl font-black">{presenceUsers.length}</p></div>
  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"><p className="text-xs text-muted-foreground">Şu an çevrimiçi</p><p className="mt-1 text-2xl font-black text-emerald-600">{presenceUsers.filter(item => item.online).length}</p></div>
  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="text-xs text-muted-foreground">Bekleyen cihaz</p><p className="mt-1 text-2xl font-black text-amber-600">{devices.filter(item => item.status === 'pending').length}</p></div>
</section>
<section className="mt-4 rounded-2xl border bg-card p-5">
  <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Canlı kullanıcı takibi</h2><p className="mt-1 text-xs text-muted-foreground">Son 90 saniyede sinyal gönderen üyeler çevrimiçi sayılır. Liste 30 saniyede yenilenir.</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">● Canlı takip</span></div>
  <div className="mt-4 grid gap-2">
    {presenceUsers.length === 0 ? <p className="text-sm text-muted-foreground">Henüz üye kaydı yok.</p> : presenceUsers.map(item => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0"><div className="font-semibold">{item.name}</div><div className="text-xs text-muted-foreground">@{item.username}</div><div className="mt-1 text-xs text-muted-foreground">📱 {item.device_label || 'Henüz tespit edilmedi'} · 🌐 {item.browser_label || '—'}</div></div>
      <div className="text-right"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${item.online ? 'bg-emerald-500/10 text-emerald-700' : 'bg-slate-500/10 text-slate-500'}`}>{item.online ? '● Çevrimiçi' : '○ Çevrimdışı'}</span><div className="mt-1 text-[11px] text-muted-foreground">{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString(getAppLocale()) : 'Henüz giriş yapmadı'}</div></div>
    </article>)}
  </div>
  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Gizlilik: Üyelik oturumu açıkken cihaz türü, tarayıcı ve son aktiflik zamanı kaydedilir. Tam iPhone modeli tarayıcı tarafından güvenilir biçimde verilmediği için gösterilmez.</p>
</section>
<section className="mt-6 rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">VIP sertifikası yükle</h2><p className="mt-1 text-sm text-muted-foreground">P12 ve provisioning profile dosyaları özel R2 kasasına kaydedilir. P12 şifresi sunucuda AES-GCM ile şifrelenir.</p><div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">{certificate ? <><div><strong>Durum:</strong> {certificate.status}</div><div><strong>P12:</strong> {certificate.certificate_name || '—'}</div><div><strong>Profil:</strong> {certificate.profile_name || '—'}</div><div><strong>Bitiş:</strong> {certificate.expires_at || 'Belirtilmedi'}</div></> : 'Henüz sertifika yüklenmedi.'}</div><form onSubmit={uploadCertificate} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">P12 / PFX dosyası<input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setP12File(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label><label className="grid gap-1.5 text-sm font-medium">Provisioning profile<input type="file" accept=".mobileprovision" onChange={e => setProfileFile(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label><Field label="P12 şifresi" type="password" autoComplete="new-password" value={certificatePassword} onChange={e => setCertificatePassword(e.target.value)} required /><Field label="Sertifika bitiş tarihi (isteğe bağlı)" type="date" value={certificateExpiry} onChange={e => setCertificateExpiry(e.target.value)} /><div className="sm:col-span-2"><button disabled={busy || !p12File || !profileFile} className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Yükleniyor…' : 'Sertifikayı güvenli yükle'}</button></div></form></section><div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Yeni kullanıcı oluştur</h2><form className="mt-4 grid gap-3" onSubmit={createUser}><Field label="Ad soyad" value={newName} onChange={e => setNewName(e.target.value)} required /><Field label="Kullanıcı adı" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoCapitalize="none" required /><Field label="E-posta" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required /><Field label="İlk şifre (en az 8 karakter)" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} /><Field label="Grup" value={newGroup} onChange={e => setNewGroup(e.target.value)} /><button disabled={busy} className="mt-1 h-11 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">Kullanıcı oluştur</button></form></section><section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Kullanıcılar</h2><span className="text-sm text-muted-foreground">{users.length} hesap</span></div><div className="mt-4 grid gap-3">{users.length === 0 ? <p className="text-sm text-muted-foreground">Henüz üye yok.</p> : users.map(item => <article key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{item.name}</div><div className="text-sm text-muted-foreground">@{item.username} · {item.group_name || 'Standart'}</div><div className="text-xs text-muted-foreground">{item.email || 'E-posta yok'}</div></div><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{item.status === 'active' ? 'Aktif' : 'Engelli'}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => updateUser(item, { status: item.status === 'active' ? 'blocked' : 'active' })} className="rounded-lg border px-3 py-2 text-xs">{item.status === 'active' ? 'Engelle' : 'Engeli kaldır'}</button><button onClick={() => { const isEnglish = window.localStorage.getItem('mehmetipa.language') === 'en'; const group = window.prompt(isEnglish ? 'New group name:' : 'Yeni grup adı:', item.group_name || (isEnglish ? 'Standard' : 'Standart')); if (group !== null) updateUser(item, { group_name: group }) }} className="rounded-lg border px-3 py-2 text-xs">Grubu değiştir</button><button onClick={() => deleteUser(item)} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Sil</button></div></article>)}</div></section></div><section className="mt-6 rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">UDID kayıtları / yönetimi</h2><span className="text-sm text-muted-foreground">{devices.length} cihaz</span></div><p className="mt-2 text-xs text-muted-foreground">Not: Safari UDID değerini otomatik doğrulayamaz; bu ekrandaki durumlar şu an kayıt ve takip amaçlıdır.</p><div className="mt-4 grid gap-3">{devices.length === 0 ? <p className="text-sm text-muted-foreground">Bekleyen cihaz kaydı yok.</p> : devices.map(device => <article key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="font-medium">{device.name || device.username || 'Üye'} · <span className="font-normal text-muted-foreground">{device.udid}</span></div><div className="text-xs text-muted-foreground">Durum: {device.status}</div></div><div className="flex flex-wrap gap-2"><button onClick={() => updateDevice(device, 'approved')} className="rounded-lg border px-3 py-2 text-xs">Onayla</button><button onClick={() => updateDevice(device, 'pending')} className="rounded-lg border px-3 py-2 text-xs">Beklet</button><button onClick={() => updateDevice(device, 'blocked')} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Engelle</button></div></article>)}</div></section></Frame>

  if (view === 'home' && user?.role === 'member') return <Frame><header className="flex items-center justify-between"><Brand /><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></header><section className="mx-auto mt-10 max-w-xl rounded-3xl border bg-card p-6"><h1 className="text-2xl font-bold">Merhaba, {user.name}</h1><p className="mt-2 text-sm text-muted-foreground">Hesabın aktif. Kayıtlı cihazlarını buradan yönetebilirsin.</p><p className="mt-2 text-xs text-muted-foreground">UDID kaydı Safari tarafından otomatik doğrulanmaz; yönetici onayı şu an kayıt takibi içindir.</p><form onSubmit={registerDevice} className="mt-6 grid gap-3"><Field label="Cihaz UDID" value={udid} onChange={e => setUdid(e.target.value)} placeholder="UDID değerini gir" required /><button disabled={busy} className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground">Cihazı onaya gönder</button></form><div className="mt-5 grid gap-2">{myDevices.map(d => <div key={d.id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span className="break-all">{d.udid}</span><span>{d.status === 'approved' ? 'Onaylandı' : d.status === 'blocked' ? 'Engellendi' : 'Bekliyor'}</span></div>)}</div><button onClick={() => setView('signer')} className="mt-6 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">İmzalama ekranını aç</button></section></Frame>

  return <main className="relative min-h-screen overflow-hidden bg-[#080B18] px-4 py-6 text-white sm:px-6 sm:py-8">
    <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-20 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-96 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
    <div className="relative mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          <img src="/icon-dark-512.PNG" alt="Mehmet IPA" className="h-11 w-11 rounded-xl object-cover ring-1 ring-white/15" />
          <div><div className="font-bold tracking-tight">Mehmet IPA</div><div className="text-xs text-slate-400">iOS Signing Platform</div></div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div id="language-picker-slot" className="shrink-0" />
          <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300 sm:inline-flex">● Platform online</span>
          <div className="flex items-center gap-2"><button onClick={() => { setLoginMode('member'); setView('login'); setError('') }} className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2.5 text-sm font-semibold shadow-lg shadow-violet-950/40 transition hover:brightness-110">Üye girişi →</button><button onClick={() => { setLoginMode('admin'); setView('login'); setError('') }} className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-amber-300/40 hover:text-amber-200">Yönetici</button></div>
        </div>
      </header>
      {isInstalledApp && availableUpdate && <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
        <div><div className="font-semibold text-cyan-100">Yeni sürüm mevcut · v{availableUpdate.version}</div><p className="mt-1 text-sm text-slate-300">{availableUpdate.notes || 'Mehmet IPA’nın yeni sürümü hazır.'}</p></div>
        <a href={availableUpdate.ipaUrl} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">IPA’yı Güncelle</a>
      </section>}

      <section className="grid items-center gap-10 pb-10 pt-14 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:pb-16">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200"><span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_12px_#a78bfa]" /> IPA signing made simple</div>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"><span data-locale="tr">iOS uygulamalarını <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">özgürce</span> imzala.</span><span data-locale="en" hidden>Sign iOS apps <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">freely</span>.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">IPA dosyalarını tarayıcı üzerinden imzala. Hesabına giriş yap, kendi sertifikanla işlemini kolayca başlat.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {!isInstalledApp && <a href={APP_DOWNLOAD} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/10">↓ Mehmet IPA uygulamasını indir</a>}
            <button onClick={() => { setLoginMode('member'); setView('login'); setError('') }} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 text-sm font-bold text-white shadow-xl shadow-violet-950/40 transition hover:scale-[1.02]">Hesabıma giriş yap <span>→</span></button>
          </div>
          <a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 px-5 text-sm font-semibold text-sky-200 transition hover:border-sky-300/60 hover:bg-sky-400/20 sm:w-auto">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M21.7 4.35a1.2 1.2 0 0 0-1.25-.18L2.9 10.9c-.9.35-.88 1.62.04 1.93l4.5 1.45 1.7 5.1c.3.88 1.43 1.08 2.02.36l2.55-3.1 4.42 3.25c.72.53 1.75.14 1.94-.74l2.7-13.5a1.2 1.2 0 0 0-.07-.9ZM9.1 13.65l8.8-5.55-6.9 7.05-.28 2.72-1.62-4.22Z"/></svg>
            Telegram'dan bize ulaş · @ajandare
          </a>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><span>✓ Tarayıcı üzerinden</span><span>✓ Mobil uyumlu</span><span>✓ Güvenli sertifika kasası</span></div>
        </div>
        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-violet-500/20 via-indigo-500/10 to-cyan-400/20 blur-2xl" />
          <div className="relative rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.11] to-white/[0.03] p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-200">İmza merkezi</div><span className="rounded-full bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold text-cyan-200">MEHMET IPA</span></div>
            <div className="mt-7 rounded-2xl border border-dashed border-violet-300/30 bg-violet-400/[0.07] px-5 py-9 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl shadow-lg shadow-violet-950/50">↑</div>
              <div className="mt-5 text-lg font-bold">IPA dosyan hazır mı?</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">Hesabına giriş yaparak imzalama ekranına geçebilirsin.</p>
              <button onClick={() => { setView('login'); setError('') }} className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-violet-100">Başlamak için giriş yap</button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">📱</div><div className="mt-1 text-[11px] text-slate-400">iOS</div></div>
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">🔐</div><div className="mt-1 text-[11px] text-slate-400">Sertifika</div></div>
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">⚡</div><div className="mt-1 text-[11px] text-slate-400">Kolay işlem</div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 py-10 sm:py-14">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">Nintendo Switch oyunları</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Oyun kataloğu</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Mehmet IPA ana sayfasında, giriş yapmadan sevdiğin oyunları keşfet.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {PUBLIC_GAMES.map(game => <PublicGameCard key={game.title} game={game} />)}
        </div>
        <div className="mb-6 mt-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-300">Capcom · Survival horror</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Resident Evil serisi</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Remake oyunları ve serinin unutulmaz diğer yapımları tek yerde.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {RESIDENT_EVIL_GAMES.map(game => <PublicGameCard key={game.title} game={game} />)}
        </div>
        <div className="mt-8 rounded-2xl border border-violet-300/20 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-cyan-500/10 p-5 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6">
          <div><div className="font-bold">Oyun rehberleri ve destek</div><p className="mt-1 text-sm leading-6 text-slate-400">Kurulum, emülatör ayarları ve performans notları için topluluğa katıl.</p></div>
          <a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200 sm:mt-0">Telegram destek · @ajandare</a>
        </div>
      </section>
      <section className="border-t border-white/10 py-10 sm:py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">VIP üyelik</p><h2 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Sana uygun paketi seç</h2><p className="mt-2 text-sm text-slate-400">VIP hizmeti kullanıma açıldığında paket seçenekleri burada olacak.</p></div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-200">Yakında aktif</span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:-translate-y-1 hover:border-violet-300/30 sm:p-6"><div className="text-sm font-semibold text-slate-300">Başlangıç</div><div className="mt-4 text-3xl font-black tabular-nums">450 TL</div><div className="mt-1 text-sm text-slate-400">≈ $8.98 USD</div><div className="mt-5 h-px bg-white/10" /><div className="mt-4 text-sm text-slate-300">1 aylık VIP paket</div><div className="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-slate-400">Yakında</div></article>
          <article className="relative rounded-2xl border border-violet-400/60 bg-gradient-to-b from-violet-500/20 to-indigo-500/[0.08] p-5 shadow-xl shadow-violet-950/20 transition hover:-translate-y-1 sm:p-6"><span className="absolute -top-3 right-5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">Avantajlı</span><div className="text-sm font-semibold text-violet-200">En çok tercih edilen</div><div className="mt-4 text-3xl font-black tabular-nums">800 TL</div><div className="mt-1 text-sm text-violet-200/80">≈ $15.96 USD</div><div className="mt-5 h-px bg-violet-200/15" /><div className="mt-4 text-sm text-slate-200">3 aylık VIP paket</div><div className="mt-5 rounded-xl border border-violet-300/25 bg-violet-300/10 px-4 py-2.5 text-center text-sm font-semibold text-violet-200">Yakında</div></article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 transition hover:-translate-y-1 hover:border-cyan-300/30 sm:p-6"><div className="text-sm font-semibold text-slate-300">Uzun dönem</div><div className="mt-4 text-3xl font-black tabular-nums">1.500 TL</div><div className="mt-1 text-sm text-slate-400">≈ $29.92 USD</div><div className="mt-5 h-px bg-white/10" /><div className="mt-4 text-sm text-slate-300">6 aylık VIP paket</div><div className="mt-5 rounded-xl border border-white/10 px-4 py-2.5 text-center text-sm font-semibold text-slate-400">Yakında</div></article>
        </div>
        <p className="mt-4 text-center text-[11px] leading-5 text-slate-500">Dolar karşılıkları 1 USD ≈ 50,14 TL referans kuruyla hesaplanmıştır; yaklaşık tutarlardır. Ödeme ve VIP hizmeti henüz aktif değildir.</p>
      </section>
      <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 text-xs text-slate-500 sm:flex-row"><div className="flex items-center gap-2"><img src="/icon-dark-512.PNG" alt="" className="h-6 w-6 rounded-md" /> © Mehmet IPA</div><div>iOS IPA Signing Platform</div></footer>
    </div>
  </main>
}

function ErrorText({ error }: { error: string }) { return error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p> : null }
function NoticeText({ notice }: { notice: string }) { return notice ? <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null }
