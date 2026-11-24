import * as React from 'react'
import { SylvaSigner } from '@/components/sylva-signer'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { useAppLanguage } from '@/lib/app-language'

type User = {
  id: string
  name: string
  username: string
  role: 'admin' | 'member'
  group_name?: string
  status?: string
  email?: string
  is_vip?: boolean
  vip_plan?: string | null
  vip_expires_at?: string | null
  vip_access_status?: string
  vip_days_remaining?: number | null
  vip_minutes_remaining?: number | null
}
type VipOrder = { id:string; user_id:string; plan_code:string; plan_name:string; amount_try:number; duration_days:number; status:string; created_at:string; paid_at?:string|null; activated_at?:string|null; name?:string; username?:string; email?:string|null }
type VipStatus = { is_vip:boolean; plan:string|null; expires_at:string|null; legacy:boolean }
type TrialStatus = { started:boolean; active:boolean; can_start:boolean; has_approved_device:boolean; started_at?:string|null; expires_at?:string|null; device_udid?:string|null }
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
  apple_status?: 'ENABLED' | 'DISABLED' | 'UNKNOWN' | string
  apple_last_error?: string | null
  apple_status_updated_at?: string | null
  profile_status?: string | null
  profile_last_error?: string | null
  profile_expires_at?: string | null
  profile_updated_at?: string | null
}
type AppleDeveloperDevice = { id:string; name:string; platform:string; udid:string; status:string; added_date?:string|null }

function getAppLocale() {
  return typeof window !== 'undefined' && window.localStorage.getItem('mehmetipa.language') === 'en' ? 'en-US' : 'tr-TR'
}

function BlockedDeviceNotice({ device }: { device: Device }) {
  const masked = device.udid.length > 8 ? `${device.udid.slice(0, 4)}••••${device.udid.slice(-4)}` : device.udid
  return <section role="alert" aria-live="assertive" className="relative mt-8 overflow-hidden rounded-3xl border border-red-400/40 bg-gradient-to-br from-red-950/90 via-[#251326] to-[#11182c] p-6 shadow-[0_0_45px_rgba(239,68,68,.16)]">
    <style>{`@keyframes udidBlockedPulse{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.18);transform:translateY(0)}50%{box-shadow:0 0 28px 4px rgba(248,113,113,.24);transform:translateY(-2px)}}@keyframes udidBlockedIn{0%{opacity:0;transform:translateY(12px) scale(.98);filter:blur(5px)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}.udid-blocked-card{animation:udidBlockedIn .45s ease-out both,udidBlockedPulse 2.4s ease-in-out .45s infinite}@media(prefers-reduced-motion:reduce){.udid-blocked-card{animation:none}}`}</style>
    <div className="udid-blocked-card rounded-2xl border border-red-300/20 bg-red-500/[.07] p-4">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500/15 text-2xl">⛔</span><div><p className="text-xs font-black tracking-[.18em] text-red-300">UDID ERİŞİMİ ENGELLENDİ</p><h2 className="mt-1 text-xl font-black text-white">IPA imzalama durduruldu</h2></div></div>
      <p className="mt-4 text-sm leading-6 text-red-100/90">Bu cihaza ait UDID yönetici tarafından engellenmiş. Güvenlik nedeniyle IPA imzalama ve imzalı dosya indirme işlemleri kapatıldı.</p>
      <div className="mt-3 rounded-xl border border-red-300/15 bg-black/25 px-3 py-2"><p className="text-[11px] uppercase tracking-wider text-red-300/70">Engellenen cihaz UDID</p><p className="mt-1 break-all font-mono text-sm text-white">{masked}</p></div>
      <p className="mt-3 text-xs text-slate-300">Erişimin yeniden açılması için Mehmet IPA yöneticisiyle iletişime geç.</p>
    </div>
  </section>
}

const TOKEN_KEY = 'mehmetipa.session.v1'
const APP_VERSION = '0.1.0'
const APP_DOWNLOAD = 'https://github.com/mehmet4665/mehmetipa-signer/releases/download/latest/Mehmet-IPA-iOS.ipa'
const UPDATE_MANIFEST = 'https://mehmetipa-signer.pages.dev/app-update.json'
const API_BASE = 'https://mehmetipa-signer.pages.dev'
const PADDLE_CLIENT_TOKEN = (import.meta as any).env?.VITE_PADDLE_CLIENT_TOKEN || ''
const PADDLE_PRICE_IDS: Record<string, string> = {
  month: 'pri_01m81yayae4ex556q74z32zwnj',
  quarter: 'pri_01m81y7amgews1qk8ebsc7a4v1',
}

async function openPaddleCheckout(order: { id: string; plan_code: string }) {
  if (!PADDLE_CLIENT_TOKEN) throw new Error('Paddle istemci anahtarı derleme ortamında bulunamadı.')
  const priceId = PADDLE_PRICE_IDS[order.plan_code]
  if (!priceId) throw new Error('VIP paket fiyatı tanımlı değil.')
  const loadPaddle = () => new Promise<void>((resolve, reject) => {
    if ((window as any).Paddle) return resolve()
    const existing = document.querySelector('script[data-paddle-js="true"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Paddle ödeme modülü yüklenemedi.')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.async = true
    script.dataset.paddleJs = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Paddle ödeme modülü yüklenemedi.'))
    document.head.appendChild(script)
  })
  await loadPaddle()
  const paddle = (window as any).Paddle
  if (!paddle) throw new Error('Paddle ödeme modülü başlatılamadı.')
  if (!(window as any).__mehmetIpaPaddleInitialized) {
    paddle.Initialize({ token: PADDLE_CLIENT_TOKEN, eventCallback: (event: any) => {
      if (event?.name === 'checkout.completed') {
        ;(window as any).__mehmetIpaCheckoutPaid = true
        window.dispatchEvent(new CustomEvent('mehmetipa:paddle-completed'))
      }
      if (event?.name === 'checkout.closed' && !(window as any).__mehmetIpaCheckoutPaid) {
        window.dispatchEvent(new CustomEvent('mehmetipa:paddle-closed', {
          detail: { orderId: (window as any).__mehmetIpaActiveOrderId }
        }))
      }
    } })
    ;(window as any).__mehmetIpaPaddleInitialized = true
  }
  ;(window as any).__mehmetIpaActiveOrderId = order.id
  ;(window as any).__mehmetIpaCheckoutPaid = false
  paddle.Checkout.open({
    items: [{ priceId, quantity: 1 }],
    customData: { vip_order_id: order.id },
    settings: { displayMode: 'wide-overlay', theme: 'dark', locale: 'tr', variant: 'one-page' }
  })
}

const FIREBASE_API_KEY = 'AIzaSyCqZO4g5E4CbHqkc0A1C86DIHQrHMv8n9U'

async function firebaseIdentityRequest<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('https://identitytoolkit.googleapis.com/v1/' + method + '?key=' + FIREBASE_API_KEY, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const code = String((data as any)?.error?.message || '')
    const messages: Record<string, string> = {
      EMAIL_EXISTS: 'Bu e-posta ile daha önce kayıt başlatılmış. Bilgilerinle devam ederek doğrulama e-postasını yeniden gönderebilirsin.',
      INVALID_EMAIL: 'E-posta adresi geçersiz.',
      WEAK_PASSWORD: 'Şifre en az 8 karakter olmalı.',
      TOO_MANY_ATTEMPTS_TRY_LATER: 'Çok fazla deneme yapıldı. Bir süre sonra tekrar dene.',
      EMAIL_NOT_FOUND: 'Firebase hesabı bulunamadı. Kayıt işlemini yeniden başlat.',
      INVALID_PASSWORD: 'E-posta veya şifre hatalı.',
      USER_DISABLED: 'Bu e-posta hesabı devre dışı.',
    }
    throw new Error(messages[code] || 'Firebase işlemi tamamlanamadı (' + (code || 'UNKNOWN') + ').')
  }
  return data as T
}

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (token) headers.set('authorization', 'Bearer ' + token)
  const url = path.startsWith('http://') || path.startsWith('https://') ? path : API_BASE + path

  // Use the native HTTP bridge in the iOS app to avoid WKWebView's opaque
  // "Load failed" network error when contacting the remote Pages API.
  if (Capacitor.isNativePlatform()) {
    let requestData: unknown = undefined
    if (typeof init.body === 'string') {
      try { requestData = JSON.parse(init.body) } catch { requestData = init.body }
    } else if (init.body !== undefined && init.body !== null) {
      requestData = init.body
    }
    const response = await CapacitorHttp.request({
      url,
      method: (init.method || 'GET').toUpperCase(),
      headers: Object.fromEntries(headers.entries()),
      data: requestData,
      connectTimeout: 20000,
      readTimeout: 30000,
      responseType: 'json',
    })
    let data = response.data as T & { error?: string }
    if (typeof data === 'string') {
      try { data = JSON.parse(data) as T & { error?: string } } catch { data = {} as T & { error?: string } }
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(data?.error || 'İstek başarısız (' + response.status + ')')
    }
    return data
  }

  const response = await fetch(url, { ...init, headers, cache: 'no-store' })
  const data = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(data.error || 'İstek başarısız (' + response.status + ')')
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
  return <article className="overflow-hidden rounded-[20px] border border-white/10 bg-gradient-to-br from-white/[0.075] to-slate-950/50 shadow-[0_12px_35px_rgba(0,0,0,.18)] transition duration-200 hover:-translate-y-1 hover:border-violet-300/35">
    <img src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.image}/header.jpg`} alt={`${game.title} kapak görseli`} loading="lazy" className="aspect-[16/9] w-full object-cover" />
    <div className="p-3">
      <h3 className="text-sm font-bold leading-5">{game.title}</h3>
      <p className="mt-1 text-xs text-slate-400">{game.genre}</p>
    </div>
  </article>
}


type SigningProgress = {stage:number;percent:number;label:string;logs:{at?:string;text:string}[]}
async function inspectIpaArchive(file:File){
 if(file.size<64)throw new Error('Dosya çok küçük; geçerli IPA değil.')
 const first=new Uint8Array(await file.slice(0,4).arrayBuffer())
 if(!(first[0]===80&&first[1]===75&&[3,5,7].includes(first[2])))throw new Error('Dosya geçerli ZIP/IPA arşivi değil.')
 const tailStart=Math.max(0,file.size-65557),tail=new Uint8Array(await file.slice(tailStart).arrayBuffer()),v=new DataView(tail.buffer,tail.byteOffset,tail.byteLength)
 let e=-1;for(let i=tail.length-22;i>=0;i--){if(v.getUint32(i,true)===0x06054b50){e=i;break}}
 if(e<0)throw new Error('ZIP merkez dizini bulunamadı; IPA bozuk veya eksik.')
 const count=v.getUint16(e+10,true),size=v.getUint32(e+12,true),offset=v.getUint32(e+16,true)
 if(!count||count>100000||offset+size>file.size)throw new Error('IPA arşiv dizini tutarsız.')
 const cd=new Uint8Array(await file.slice(offset,offset+size).arrayBuffer()),cv=new DataView(cd.buffer,cd.byteOffset,cd.byteLength),names:string[]=[]
 let p=0;while(p+46<=cd.length&&names.length<count){if(cv.getUint32(p,true)!==0x02014b50)throw new Error('IPA merkez dizini okunamadı.');const n=cv.getUint16(p+28,true),x=cv.getUint16(p+30,true),c=cv.getUint16(p+32,true),next=p+46+n+x+c;if(next>cd.length)throw new Error('IPA içinde eksik kayıt var.');names.push(new TextDecoder().decode(cd.slice(p+46,p+46+n)));p=next}
 const info=names.find(n=>/^Payload\/[^/]+\.app\/Info\.plist$/i.test(n))
 if(!info)throw new Error('Payload/*.app/Info.plist bulunamadı. Dosya iOS IPA paketi değil.')
 return {entryCount:count,appPath:info.replace(/Info\.plist$/i,'')}
}
function MemberSigningPanel({username,token,onHome,onLogout}:{username:string;token:string;onHome:()=>void;onLogout:()=>void}){
 const [ipaFile,setIpaFile]=React.useState<File|null>(null),[message,setMessage]=React.useState(''),[messageType,setMessageType]=React.useState<'info'|'success'|'error'>('info'),[isSigning,setIsSigning]=React.useState(false)
 const [showQueueCleanup,setShowQueueCleanup]=React.useState(false),[isQueueCleanup,setIsQueueCleanup]=React.useState(false)
 const [progress,setProgress]=React.useState<SigningProgress>({stage:0,percent:0,label:'IPA dosyası bekleniyor',logs:[]}),[failedStage,setFailedStage]=React.useState(0)
 const [signedUrl,setSignedUrl]=React.useState<string|null>(null),[installUrl,setInstallUrl]=React.useState<string|null>(null),[signedFileName,setSignedFileName]=React.useState('')
 const [lastJobId,setLastJobId]=React.useState<string|null>(null),[isRepairing,setIsRepairing]=React.useState(false)
 const [archiveInfo,setArchiveInfo]=React.useState<{entryCount:number;appPath:string}|null>(null),[elapsed,setElapsed]=React.useState(0),[showTerminal,setShowTerminal]=React.useState(true)
 const english=useAppLanguage()==='en',fileInput=React.useRef<HTMLInputElement>(null),startedAt=React.useRef<number|null>(null),localLogs=React.useRef<{at:string;text:string}[]>([])
 const t=(tr:string,en:string)=>english?en:tr
 const addLog=(text:string)=>{const at=new Date().toLocaleTimeString(getAppLocale(),{hour12:false});localLogs.current=[...localLogs.current,{at,text}].slice(-60);setProgress(p=>({...p,logs:[...localLogs.current]}))}
 const reset=()=>{setSignedUrl(null);setInstallUrl(null);setSignedFileName('');setLastJobId(null);setProgress({stage:0,percent:0,label:t('IPA dosyası bekleniyor','Waiting for IPA file'),logs:[]});setFailedStage(0);setArchiveInfo(null);setElapsed(0);localLogs.current=[];startedAt.current=null}
 React.useEffect(()=>{if(!isSigning)return;const timer=window.setInterval(()=>{if(startedAt.current)setElapsed(Math.floor((Date.now()-startedAt.current)/1000))},1000);return()=>window.clearInterval(timer)},[isSigning])
 const chooseFile=async(file?:File)=>{setMessage('');setMessageType('info');reset();if(!file){setIpaFile(null);return}
  if(!file.name.toLowerCase().endsWith('.ipa')){setIpaFile(null);setMessage(t('Yalnızca .ipa dosyası seç.','Only .ipa files are accepted.'));setMessageType('error');return}
  if(file.size>500*1024*1024){setIpaFile(null);setMessage(t('Dosya 500 MB sınırını aşıyor.','File exceeds the 500 MB limit.'));setMessageType('error');return}
  setProgress({stage:1,percent:3,label:t('Dosya türü ve boyutu kontrol ediliyor','Checking file type and size'),logs:[]});addLog('> FILE_GATE: .ipa uzantısı doğrulandı');addLog('> SIZE_CHECK: '+(file.size/1048576).toFixed(2)+' MB / 500 MB')
  try{const info=await inspectIpaArchive(file);setArchiveInfo(info);setIpaFile(file);addLog('> ZIP_SIGNATURE: PASS');addLog('> CENTRAL_DIRECTORY: '+info.entryCount+' kayıt');addLog('> APP_BUNDLE: '+info.appPath);addLog('> INFO_PLIST: bulundu · Bundle ID/sürüm sunucuda doğrulanacak');setProgress({stage:2,percent:10,label:t('IPA arşivi ve Payload yapısı doğrulandı','IPA archive and Payload validated'),logs:[...localLogs.current]})}
  catch(e){setIpaFile(null);setFailedStage(2);const d=e instanceof Error?e.message:'IPA analizi başarısız';setMessage(d);setMessageType('error');addLog('> IPA_INSPECTION: FAILED · '+d);setProgress(p=>({...p,label:t('IPA kontrolü başarısız','IPA validation failed'),logs:[...localLogs.current]}))}
 }
 const startSigning=async()=>{
  if(!ipaFile||isSigning||signedUrl)return;
  if(!token){setMessage(t('Tekrar giriş yap.','Sign in again.'));setMessageType('error');return}
  setIsSigning(true);setFailedStage(0);setMessage('');setSignedUrl(null);setInstallUrl(null);
  startedAt.current=Date.now();setElapsed(0);
  const jobId=crypto.randomUUID();
  setLastJobId(jobId);
  let queueCreated=false,signRequestStarted=false,signingSucceeded=false,handleSigningPageHide:(()=>void)|null=null;
  let progressPollTimer:number|undefined,queueHeartbeatTimer:number|undefined,serverLogKey='';
  const delay=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
  const queueStatus=async()=>{
    return await api<any>('/api/signing/queue/'+jobId,token,{method:'GET'});
  };
  const cancelQueue=async()=>{
    try{await api('/api/signing/queue/'+jobId+'/cancel',token,{method:'POST',body:JSON.stringify({})})}catch{}
  };
  const poll=async()=>{
    try{
      const r=await fetch(API_BASE+'/api/signing/progress/'+jobId,{headers:{authorization:'Bearer '+token},cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json() as SigningProgress;
      const key=JSON.stringify(d.logs||[]);
      if(key!==serverLogKey){
        serverLogKey=key;
        const lines=(d.logs||[]).map(x=>({at:x.at?new Date(x.at).toLocaleTimeString(getAppLocale(),{hour12:false}):'',text:x.text}));
        setProgress(p=>({...p,stage:Math.max(p.stage,d.stage||0),percent:Math.max(p.percent,d.percent||0),label:d.label||p.label,logs:[...localLogs.current,...lines].slice(-80)}));
      }else{
        setProgress(p=>({...p,stage:Math.max(p.stage,d.stage||0),percent:Math.max(p.percent,d.percent||0),label:d.label||p.label}));
      }
    }catch{}
  };
  const uploadSingle=(file:File)=>new Promise<void>((resolve,reject)=>{
    const fd=new FormData();
    fd.append('job_id',jobId);
    fd.append('file_name',file.name);
    fd.append('file',file,file.name);
    const xhr=new XMLHttpRequest();
    xhr.open('POST',API_BASE+'/api/signing/upload/single');
    xhr.setRequestHeader('Authorization','Bearer '+token);
    xhr.responseType='text';
    xhr.timeout=5*60*1000;
    xhr.upload.onprogress=e=>{
      if(e.lengthComputable){
        const pct=Math.min(50,18+Math.round((e.loaded/e.total)*32));
        setProgress(p=>({...p,stage:2,percent:Math.max(p.percent,pct),label:t('IPA tek parça yükleniyor','Uploading IPA as one file')}));
      }
    };
    xhr.onload=()=>{
      let d:any={};
      try{d=JSON.parse(xhr.responseText||'{}')}catch{reject(new Error(t('Yükleme yanıtı okunamadı.','Upload response could not be read.')));return}
      if(xhr.status<200||xhr.status>=300||!d.success){reject(new Error(d.error||('HTTP '+xhr.status)));return}
      resolve();
    };
    xhr.onerror=()=>reject(new Error(t('Doğrudan yüklemede ağ bağlantısı kesildi.','Network connection failed during direct upload.')));
    xhr.ontimeout=()=>reject(new Error(t('Doğrudan yükleme zaman aşımına uğradı.','Direct upload timed out.')));
    xhr.send(fd);
  });
  const uploadPart=(partNumber:number,chunk:Blob,totalParts:number)=>new Promise<{etag:string}>((resolve,reject)=>{
    const fd=new FormData();
    fd.append('job_id',jobId);
    fd.append('part_number',String(partNumber));
    fd.append('chunk',chunk,'part-'+partNumber+'.bin');
    const xhr=new XMLHttpRequest();
    xhr.open('POST',API_BASE+'/api/signing/upload/part');
    xhr.setRequestHeader('Authorization','Bearer '+token);
    xhr.responseType='text';
    xhr.timeout=5*60*1000;
    xhr.upload.onprogress=e=>{
      if(e.lengthComputable){
        const partProgress=(partNumber-1)+(e.loaded/e.total);
        const pct=Math.min(50,18+Math.round(partProgress/totalParts*32));
        setProgress(p=>({...p,stage:2,percent:Math.max(p.percent,pct),label:t('IPA parçası yükleniyor','Uploading IPA part')+' · '+partNumber+'/'+totalParts}));
      }
    };
    xhr.onload=()=>{
      let d:any={};
      try{d=JSON.parse(xhr.responseText||'{}')}catch{reject(new Error(t('Yükleme yanıtı okunamadı.','Upload response could not be read.')));return}
      if(xhr.status<200||xhr.status>=300){reject(new Error(d.error||('HTTP '+xhr.status)));return}
      if(!d.etag){reject(new Error(t('Yükleme parçası doğrulanamadı.','Uploaded part could not be verified.')));return}
      resolve({etag:String(d.etag)});
    };
    xhr.onerror=()=>reject(new Error(t('Parçalı yüklemede ağ bağlantısı kesildi.','Network connection failed during chunk upload.')));
    xhr.ontimeout=()=>reject(new Error(t('Parçalı yükleme zaman aşımına uğradı.','Chunk upload timed out.')));
    xhr.send(fd);
  });
  try{
    setProgress({stage:2,percent:12,label:t('İmza sırası kontrol ediliyor','Checking the signing queue'),logs:[...localLogs.current]});
    addLog('> JOB_ID: '+jobId);
    addLog('> QUEUE_GATE: maximum 10 concurrent signing jobs');
    const queued=await api<any>('/api/signing/queue',token,{
      method:'POST',
      body:JSON.stringify({job_id:jobId,file_name:ipaFile.name,file_size:ipaFile.size})
    });
    queueCreated=true;
    handleSigningPageHide=()=>{
      if(!queueCreated||signRequestStarted||signingSucceeded)return;
      void fetch(API_BASE+'/api/signing/queue/'+jobId+'/cancel',{
        method:'POST',
        headers:{authorization:'Bearer '+token,'content-type':'application/json'},
        body:'{}',
        keepalive:true,
        cache:'no-store'
      }).catch(()=>{});
    };
    window.addEventListener('pagehide',handleSigningPageHide);
    let queue=queued;
    while(queue.status==='queued'){
      const position=Number(queue.queue_position||1);
      const etaMinutes=Math.max(1,Math.ceil(Number(queue.estimated_wait_seconds||300)/60));
      setProgress(p=>({...p,stage:2,percent:12,label:t('Sıradasın','You are in the queue')+' · '+position+'. '+t('sıra','in line')+' · '+t('tahmini','estimated')+' '+etaMinutes+' '+t('dk','min')}));
      await delay(5000);
      queue=await queueStatus();
      if(['expired','failed','cancelled'].includes(String(queue.status))){
        throw new Error(t('İmza sırası süresi doldu veya iptal edildi. Yeniden dene.','Your queue ticket expired or was cancelled. Please retry.'));
      }
    }
    if(queue.status!=='active'){
      throw new Error(queue.error||t('İmza sırası başlatılamadı.','Signing queue could not be started.'));
    }
    addLog('> QUEUE_SLOT: ACTIVE · '+(queue.active_count||1)+'/10');
    setProgress(p=>({...p,stage:2,percent:15,label:t('Sıran geldi · güvenli yükleme hazırlanıyor','Your turn · preparing secure upload')}));
    queueHeartbeatTimer=window.setInterval(()=>{void queueStatus().catch(()=>{})},10000);
    const uploadInit=await api<any>('/api/signing/upload/init',token,{
      method:'POST',
      body:JSON.stringify({job_id:jobId,file_name:ipaFile.name,file_size:ipaFile.size})
    });
    if(uploadInit.upload_mode==='single'){
      addLog('> UPLOAD_MODE: SINGLE · '+(ipaFile.size/1048576).toFixed(2)+' MB');
      await uploadSingle(ipaFile);
      addLog('> R2_SINGLE_UPLOAD: VERIFIED');
    }else{
      const chunkSize=Number(uploadInit.chunk_size||25*1024*1024);
      const totalParts=Number(uploadInit.total_parts||Math.ceil(ipaFile.size/chunkSize));
      const parts:{partNumber:number;etag:string}[]=[];
      const uploadOnePart=async(partNumber:number)=>{
        const start=(partNumber-1)*chunkSize;
        const end=Math.min(ipaFile.size,start+chunkSize);
        const chunk=ipaFile.slice(start,end);
        let uploaded:{etag:string}|undefined;
        let lastError:unknown;
        for(let attempt=1;attempt<=3&&!uploaded;attempt++){
          try{
            uploaded=await uploadPart(partNumber,chunk,totalParts);
          }catch(error){
            lastError=error;
            if(attempt<3)await delay(700*attempt);
          }
        }
        if(!uploaded)throw lastError instanceof Error?lastError:new Error(t('IPA parçası yüklenemedi.','IPA chunk upload failed.'));
        return {partNumber,etag:uploaded.etag};
      };
      // IPAs above the safe direct-upload ceiling use parallel 25 MiB parts.
      for(let first=1;first<=totalParts;first+=2){
        const batch=Array.from({length:Math.min(2,totalParts-first+1)},(_,i)=>first+i);
        const uploadedBatch=await Promise.all(batch.map(uploadOnePart));
        parts.push(...uploadedBatch);
        await queueStatus().catch(()=>{});
      }
      parts.sort((a,b)=>a.partNumber-b.partNumber);
      setProgress(p=>({...p,stage:2,percent:52,label:t('IPA parçaları birleştiriliyor','Completing multipart IPA upload')}));
      await api('/api/signing/upload/complete',token,{
        method:'POST',
        body:JSON.stringify({job_id:jobId,parts})
      });
      addLog('> R2_MULTIPART: '+totalParts+' PARTS COMPLETED · '+(ipaFile.size/1048576).toFixed(2)+' MB');
    }
    setProgress(p=>({...p,stage:2,percent:52,label:t('IPA yüklemesi doğrulandı','IPA upload verified')}));
    setProgress(p=>({...p,stage:3,percent:56,label:t('Sertifika ve cihaz profili doğrulanıyor','Validating certificate and device profile')}));
    progressPollTimer=window.setInterval(poll,900);
    await poll();
    signRequestStarted=true;
    setProgress(p=>({...p,stage:4,percent:64,label:t('IPA Zsign ile imzalanıyor','Signing IPA with Zsign')}));
    const result=await new Promise<{success?:boolean;install_url?:string;download_url?:string;file_name?:string;error?:string}>((resolve,reject)=>{
      const xhr=new XMLHttpRequest();
      xhr.open('POST',API_BASE+'/api/signing/vip');
      xhr.setRequestHeader('Authorization','Bearer '+token);
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.responseType='text';
      xhr.timeout=20*60*1000;
      xhr.onload=()=>{
        let d:any={};
        try{d=JSON.parse(xhr.responseText||'{}')}catch{reject(new Error(t('Sunucu yanıtı okunamadı.','Server response could not be read.')));return}
        if(xhr.status<200||xhr.status>=300){reject(new Error(d.error||('HTTP '+xhr.status)));return}
        resolve(d);
      };
      xhr.onerror=()=>reject(new Error(t('İmzalama sırasında ağ bağlantısı kesildi.','Network connection failed during signing.')));
      xhr.ontimeout=()=>reject(new Error(t('İmzalama isteği zaman aşımına uğradı.','Signing request timed out.')));
      xhr.send(JSON.stringify({job_id:jobId,file_name:ipaFile.name}));
    });
    await poll();
    if(!result.success||!result.install_url||!result.download_url)throw new Error(result.error||t('Kurulum bağlantısı alınamadı.','Install link missing.'));
    signingSucceeded=true;
    setSignedUrl(result.download_url);
    setInstallUrl(result.install_url);
    setSignedFileName(result.file_name||ipaFile.name.replace(/\.ipa$/i,'-signed.ipa'));
    setProgress(p=>({...p,stage:5,percent:100,label:t('İmzalama tamamlandı · IPA hazır','Signing complete · IPA ready')}));
    addLog('> RESULT: SIGNATURE_VERIFIED');
    addLog('> SOURCE_IPA: DELETED_AFTER_SIGNING');
    addLog('> SIGNED_IPA: AUTO_DELETE_AFTER_5_MINUTES');
    setProgress(p=>({...p,logs:[...localLogs.current,...p.logs.filter(x=>!localLogs.current.some(y=>y.text===x.text))].slice(-80)}));
    setMessage(t('IPA başarıyla imzalandı. Kurulum ve indirme bağlantısı 5 dakika geçerlidir.','IPA signed successfully. Install and download links are valid for 5 minutes.'));
    setMessageType('success');
  }catch(e){
    const d=e instanceof Error?e.message:'İmzalama başarısız';
    setFailedStage(progress.stage||4);
    setMessage(d);
    setMessageType('error');
    if(d.includes('zaten bekleyen veya çalışan bir imza işlemi var'))setShowQueueCleanup(true);
    addLog('> PIPELINE: FAILED · '+d);
    setProgress(p=>({...p,label:t('İşlem hata verdi','Pipeline failed'),logs:[...localLogs.current,...p.logs].slice(-80)}));
    if(queueCreated&&!signRequestStarted)await cancelQueue();
    if(queueCreated&&signRequestStarted&&!signingSucceeded){
      // The server-side signing handler owns final R2 cleanup and queue release after it starts.
      await queueStatus().catch(()=>{});
    }
  }finally{
    if(progressPollTimer)window.clearInterval(progressPollTimer);
    if(queueHeartbeatTimer)window.clearInterval(queueHeartbeatTimer);
    if(handleSigningPageHide)window.removeEventListener('pagehide',handleSigningPageHide);
    setIsSigning(false);
  }
 }
 const repairSigning=async()=>{
  if(isRepairing||isSigning)return;
  if(!ipaFile||!token){setMessage(t('Kurtarma için IPA dosyasını yeniden seçmen gerekiyor.','Select the IPA again to recover this signing job.'));setMessageType('error');return;}
  setIsRepairing(true);
  setMessage(t('Önceki imza işleminin sunucudaki sonucunu kontrol ediyorum…','Checking the previous signing result on the server…'));
  setMessageType('info');
  const delay=(ms:number)=>new Promise(resolve=>window.setTimeout(resolve,ms));
  const restoreResult=(state:any)=>{
    const result=state?.result;
    if(!result?.install_url||!result?.download_url||!result?.expires_at||Date.parse(result.expires_at)<=Date.now())return false;
    setInstallUrl(String(result.install_url));
    setSignedUrl(String(result.download_url));
    setSignedFileName(String(result.file_name||ipaFile.name.replace(/\\.ipa$/i,'-signed.ipa')));
    setProgress({stage:5,percent:100,label:t('İmzalama tamamlandı · IPA hazır','Signing complete · IPA ready'),logs:(state.logs||[]).map((line:any)=>({at:line.at?new Date(line.at).toLocaleTimeString(getAppLocale(),{hour12:false}):'',text:String(line.text||'')}))});
    setMessage(t('Sunucuda imzalama zaten tamamlanmış. Aynı sonucu geri yükledim; yeniden imzalama yapılmadı.','The server had already completed signing. I restored the original result without signing twice.'));
    setMessageType('success');
    return true;
  };
  try{
    if(lastJobId){
      let snapshot:any=null;
      try{snapshot=await api<any>('/api/signing/progress/'+lastJobId,token,{method:'GET'});}catch{}
      if(restoreResult(snapshot))return;
      let queue:any=null,queueReadable=true;
      try{queue=await api<any>('/api/signing/queue/'+lastJobId,token,{method:'GET'});}catch{queueReadable=false;}
      if(queueReadable&&queue&&['queued','active'].includes(String(queue.status))){
        for(let attempt=0;attempt<15;attempt++){
          setMessage(t('Önceki işlem hâlâ sunucuda çalışıyor. Çift imza oluşturmamak için sonucunu bekliyorum…','The previous job is still running. Waiting for its result to avoid duplicate signing…'));
          await delay(2000);
          try{snapshot=await api<any>('/api/signing/progress/'+lastJobId,token,{method:'GET'});}catch{}
          if(restoreResult(snapshot))return;
          try{queue=await api<any>('/api/signing/queue/'+lastJobId,token,{method:'GET'});}catch{queueReadable=false;break;}
          if(!['queued','active'].includes(String(queue.status)))break;
        }
        if(queueReadable&&queue&&['queued','active'].includes(String(queue.status))){
          setMessage(t('Önceki işlem sunucuda hâlâ sürüyor. Yeni imza başlatmadım; birkaç saniye sonra tekrar kontrol et.','The previous job is still active. I did not start a duplicate; check again shortly.'));
          setMessageType('info');
          return;
        }
      }
      if(!queueReadable){
        setMessage(t('Sunucu durumunu doğrulayamadım. Çift işlem oluşturmamak için yeniden imzalama başlatmadım. Bağlantı düzelince tekrar dene.','I could not verify the server state, so I did not start a duplicate signing job. Retry when the connection is stable.'));
        setMessageType('error');
        return;
      }
      const lastError=String(snapshot?.logs?.[snapshot.logs.length-1]?.text||message||'');
      if(!/network|connection|forward|timeout|timed out|503|temporar|bağlantı|zaman aşım|geçici/i.test(lastError)){
        setMessage(t('Bu hata otomatik tekrar imzalamayla çözülecek türde görünmüyor. Sertifika, UDID, profil veya IPA doğrulama hatasıysa önce o kaynağın düzeltilmesi gerekir. Kayıt: ','This does not look like a transient connection error. Certificate, UDID, profile, or IPA validation problems must be fixed at the source. Record: ')+lastError);
        setMessageType('error');
        return;
      }
    }
    setIsRepairing(false);
    setMessage(t('Önceki deneme tamamlanmamış. Aynı IPA yeni bir iş kimliğiyle güvenli şekilde yeniden yüklenecek…','The previous attempt did not complete. The same IPA will be uploaded again under a fresh job ID…'));
    setMessageType('info');
    await startSigning();
  }catch(error){
    setMessage(error instanceof Error?error.message:t('Kurtarma kontrolü başarısız.','Recovery check failed.'));
    setMessageType('error');
  }finally{
    setIsRepairing(false);
  }
 };
 const cleanupOldSigning=async()=>{
  if(isQueueCleanup||!token)return;
  setIsQueueCleanup(true);
  try{
   const result=await api<any>('/api/signing/queue/recover',token,{method:'POST',body:JSON.stringify({})});
   setShowQueueCleanup(false);
   setMessage(result.cleared>0?t('Eski imza işlemi ve geçici dosyaları temizlendi. Şimdi IPA dosyanı yeniden seçip imzalayabilirsin.','The old signing job and temporary files were cleared. Select your IPA again and retry.'):t('Temizlenecek eski bir imza işlemi bulunamadı. Sayfayı yenileyip tekrar dene.','No old signing job was found. Refresh the page and try again.'));
   setMessageType(result.cleared>0?'success':'info');
   addLog('> QUEUE_RECOVERY: '+String(result.cleared||0)+' eski işlem temizlendi');
   setIpaFile(null);if(fileInput.current)fileInput.current.value='';reset();
  }catch(e){
   const d=e instanceof Error?e.message:t('Eski işlem temizlenemedi.','Could not clear the old job.');
   setMessage(d);setMessageType('error');
  }finally{setIsQueueCleanup(false)}
 }
 const steps=[
  {title:t('IPA dosyası kontrolü','IPA file validation'),desc:t('Uzantı · boyut · ZIP imzası · 500 MB','Extension · size · ZIP signature · 500 MB'),code:'FILE_GATE / SIZE_CHECK'},
  {title:t('IPA paket analizi','IPA package analysis'),desc:t('ZIP dizini · Payload · .app · Info.plist','ZIP directory · Payload · .app · Info.plist'),code:'ZIP_SCAN / APP_BUNDLE'},
  {title:t('Sertifika ve profil kontrolü','Certificate & profile'),desc:t('P12 · profil süresi · Bundle ID · UDID','P12 · profile expiry · Bundle ID · UDID'),code:'CERT_VALIDATE / PROFILE_MATCH'},
  {title:t('İmzalama motoru','Signing engine'),desc:t('Konteyner · Zsign · uygulama imzası','Container · Zsign · app signature'),code:'CONTAINER_BOOT / ZSIGN_EXEC'},
  {title:t('Son doğrulama ve teslimat','Final verification & delivery'),desc:t('İmza · IPA çıktısı · R2 · OTA manifest','Signature · IPA output · R2 · OTA manifest'),code:'VERIFY / R2_STORE / OTA_READY'}
 ]
 const time=String(Math.floor(elapsed/60)).padStart(2,'0')+':'+String(elapsed%60).padStart(2,'0')
 return <section className="relative min-h-screen overflow-hidden bg-[#070A16] bg-[radial-gradient(ellipse_at_10%_0%,rgba(124,58,237,.20),transparent_34%),radial-gradient(ellipse_at_95%_35%,rgba(6,182,212,.12),transparent_30%),linear-gradient(180deg,#080b18,#090d1b_55%,#070a14)] px-4 pb-10 pt-5 text-white sm:px-6">
 <div className="pointer-events-none absolute -right-32 top-20 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl"/><div className="relative mx-auto max-w-3xl">
 <header className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-violet-300/20 bg-[#11182c]/85 px-4 py-3 shadow-xl"><div className="flex items-center gap-3"><img src="/icon-dark-512.PNG" alt="Mehmet IPA" className="h-10 w-10 rounded-xl"/><div><div className="font-bold tracking-wide">MEHMET IPA</div><div className="text-[10px] uppercase tracking-[.22em] text-cyan-200">SIGNING ENGINE · v2</div></div></div><div className="flex items-center gap-2"><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">● ENGINE ONLINE</span><button onClick={onHome} className="rounded-xl border border-white/15 px-3 py-2 text-xs">{t('← Ana sayfa','← Home')}</button><button onClick={onLogout} className="rounded-xl border border-red-400/20 px-3 py-2 text-xs text-red-200">{t('Çıkış','Sign out')}</button></div></header>
 <section className="mt-7"><p className="text-[10px] font-bold uppercase tracking-[.25em] text-violet-200">PRIVATE IPA WORKFLOW / VIP ACCESS</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{t('Akıllı IPA imzalama','Smart IPA signing')}</h1><p className="mt-2 text-sm text-slate-400">{t('Dosyanı analiz et, güvenli şekilde imzala ve iPhone’una yükle.','Analyze, sign securely and install on your iPhone.')}</p></section>
 <section className="mt-6 rounded-3xl border border-violet-300/20 bg-[#11182c]/85 p-5 shadow-xl">
 <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-violet-500/15 text-2xl">📦</div><div><h2 className="font-bold">{t('IPA dosyası','IPA package')}</h2><p className="text-xs text-slate-400">{t('Maksimum dosya boyutu 500 MB','Maximum file size 500 MB')}</p></div></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-1.5 text-[10px] font-bold text-cyan-100">.IPA / 500 MB</span></div>
 <input ref={fileInput} type="file" accept=".ipa,application/octet-stream" className="hidden" onChange={e=>chooseFile(e.target.files?.[0])}/>
 {!signedUrl&&<button type="button" disabled={isSigning} onClick={()=>fileInput.current?.click()} className="mt-5 flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-violet-300/40 bg-violet-500/[.07] px-4 py-6 text-center disabled:opacity-50"><span className="text-3xl">{ipaFile?'📲':'⬆️'}</span><span className="font-bold">{ipaFile?t('Başka IPA seç','Choose another IPA'):t('Dosyalardan IPA seç','Select IPA from Files')}</span><span className="max-w-full break-all text-xs text-slate-400">{ipaFile?ipaFile.name:t('Yalnızca .ipa · En fazla 500 MB','Only .ipa · Up to 500 MB')}</span></button>}
 {ipaFile&&<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] uppercase text-slate-500">{t('Dosya boyutu','File size')}</div><div className="mt-1 text-sm font-bold">{(ipaFile.size/1048576).toFixed(2)} MB</div></div><div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-[9px] uppercase text-slate-500">{t('Arşiv kaydı','Archive entries')}</div><div className="mt-1 text-sm font-bold">{archiveInfo?.entryCount??'—'}</div></div><div className="col-span-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:col-span-1"><div className="text-[9px] uppercase text-slate-500">{t('Uygulama paketi','App bundle')}</div><div className="mt-1 break-all text-xs font-semibold text-emerald-200">{archiveInfo?.appPath||'—'}</div></div></div>}
 {!signedUrl&&ipaFile&&<button type="button" disabled={isSigning} onClick={()=>{setIpaFile(null);if(fileInput.current)fileInput.current.value='';reset();setMessage('')}} className="mt-3 text-xs text-slate-400 underline">{t('Dosyayı kaldır','Remove file')}</button>}
 </section>

 <section className="mt-4 rounded-3xl border border-white/10 bg-[#11182c]/80 p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{t('İşlem aşamaları','Pipeline stages')}</h2><span className="text-[10px] uppercase tracking-wider text-slate-500">LIVE PROCESS</span></div><ol className="mt-5 space-y-3">{steps.map((step,i)=>{const n=i+1,done=progress.stage>n||(progress.stage===5&&progress.percent===100),active=isSigning&&progress.stage===n&&!done,failed=failedStage===n;const box=done?'border-emerald-400/25 bg-emerald-400/[.055]':active?'border-violet-300/35 bg-violet-400/[.07]':failed?'border-red-400/30 bg-red-400/[.06]':'border-white/[.07] bg-black/10';const ico=done?'border-emerald-400/30 bg-emerald-400/10 text-emerald-300':active?'border-violet-300/40 bg-violet-400/10 text-violet-100':failed?'border-red-400/30 bg-red-400/10 text-red-200':'border-white/10 bg-black/20 text-slate-500';return <li key={step.code} className={'rounded-2xl border p-3 '+box}><div className="flex items-center gap-3"><span className={'grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-xs font-black '+ico}>{done?'✓':String(n).padStart(2,'0')}</span><div className="min-w-0 flex-1"><div className="text-sm font-semibold">{step.title}</div><div className="mt-1 text-[11px] text-slate-400">{step.desc}</div><div className="mt-1 font-mono text-[9px] text-slate-600">{step.code}</div></div><span className={'shrink-0 text-[9px] font-bold '+(done?'text-emerald-300':active?'text-violet-200':failed?'text-red-300':'text-slate-600')}>{done?t('TAMAM','DONE'):active?t('ÇALIŞIYOR','RUNNING'):failed?t('HATA','FAILED'):t('BEKLİYOR','WAITING')}</span></div></li>})}</ol></section>
 <section className="mt-4 overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#080e19]"><button type="button" onClick={()=>setShowTerminal(v=>!v)} className="flex w-full items-center justify-between border-b border-white/10 px-4 py-3 text-left"><div><div className="text-[10px] font-bold uppercase tracking-[.22em] text-emerald-300">LIVE TERMINAL</div><div className="mt-1 text-xs text-slate-400">{t('Teknik kayıtlar · gizli anahtarlar gösterilmez','Technical logs · secrets are hidden')}</div></div><span className="font-mono text-emerald-300">{showTerminal?'−':'+'}</span></button>{showTerminal&&<div className="max-h-64 overflow-y-auto p-4 font-mono text-[10px] leading-5">{(progress.logs.length?progress.logs:[{text:'> MEHMET_IPA_ENGINE :: READY'},{text:'> WAITING_FOR_IPA_FILE'}]).map((line,i)=><div key={i} className="break-all text-emerald-300/90"><span className="mr-2 text-slate-600">{line.at||'SYS'}</span>{line.text}</div>)}{isSigning&&<div className="animate-pulse text-cyan-300">▌ {t('İşlem devam ediyor...','Processing...')}</div>}</div>}</section>
 <section className="mt-4 rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="text-sm font-semibold"><span className="text-emerald-300">🔒</span> {t('Sertifika koruması aktif','Certificate protection active')}</div><p className="mt-1 text-xs leading-5 text-slate-400">{t('P12 parolası ve özel anahtar terminalde gösterilmez. Sertifika yalnızca sunucudaki özel imzalama motorunda kullanılır.','The P12 password and private key are never shown in logs. Credentials stay on the private signing engine.')}</p></section>
 {message&&<div role="status" className={'mt-4 whitespace-pre-wrap rounded-xl border p-3 text-sm '+(messageType==='success'?'border-emerald-300/20 bg-emerald-300/[.07] text-emerald-100':messageType==='error'?'border-red-300/25 bg-red-300/[.07] text-red-100':'border-cyan-300/20 bg-cyan-300/[.07] text-cyan-100')}>{message}</div>}
 {messageType==='error'&&ipaFile&&!signedUrl&&!isSigning&&<button type="button" disabled={isRepairing} onClick={repairSigning} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 font-bold text-amber-100 disabled:opacity-50">{isRepairing?t('Hata kontrol ediliyor…','Checking and repairing…'):t('🛠 Hatayı düzelt','🛠 Fix this error')}</button>}
 {showQueueCleanup&&<section className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/[.07] p-4"><div className="font-bold text-amber-100">{t('Eski imza işlemi takılı kalmış','A previous signing job is stuck')}</div><p className="mt-1 text-xs leading-5 text-slate-300">{t('Önceki yükleme yarıda kalmış olabilir. Eski kuyruk kaydını ve ona ait geçici IPA dosyalarını temizleyebilirsin. Devam eden imzalama varsa bu işlem onu da iptal eder.','A previous upload may have been interrupted. You can clear its queue record and temporary IPA files. If signing is still running, this will cancel it too.')}</p><button type="button" disabled={isQueueCleanup} onClick={cleanupOldSigning} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-xl bg-amber-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{isQueueCleanup?t('Eski işlem temizleniyor…','Clearing old job…'):t('Eski işlemi temizle','Clear old signing job')}</button></section>}
 <section className="mt-4 rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/[.07] to-violet-500/[.08] p-5"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.22em] text-cyan-100/70">PIPELINE STATUS</div><h2 className="mt-1 font-bold">{t('İmzalama ilerlemesi','Signing progress')}</h2></div><div className="text-right"><div className="text-3xl font-black tabular-nums text-cyan-100">{progress.percent}%</div><div className="text-[10px] text-slate-400">{isSigning?time:t('Hazır','Ready')}</div></div></div><div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-black/40"><div className={'h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 transition-all duration-500 '+(isSigning&&progress.percent<100?'animate-pulse':'')} style={{width:progress.percent+'%'}}/></div><div className="mt-2 flex justify-between gap-2 text-xs"><span className="text-slate-300">{progress.label}</span><span className="font-mono text-cyan-200">{t('Aşama','Stage')} {progress.stage}/5</span></div></section>
 {!signedUrl&&<button type="button" disabled={!ipaFile||isSigning} onClick={startSigning} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-4 font-bold shadow-xl disabled:opacity-40">{isSigning?t('İmzalanıyor...','Signing...'):t('İmzalamayı başlat','Start signing')} <span>{isSigning?'⏳':'→'}</span></button>}

 {installUrl&&<button type="button" onClick={()=>{window.location.href=installUrl}} className="mt-4 flex min-h-14 w-full items-center justify-center rounded-2xl border border-emerald-300/40 bg-emerald-400/15 px-5 py-4 font-bold text-emerald-100 shadow-lg shadow-emerald-950/20">↓ {t('iPhone’a yükle','Install on iPhone')}</button>}
 {signedUrl&&<a href={signedUrl} download={signedFileName} className="mt-3 flex min-h-12 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/[.05] px-5 py-3 text-sm font-semibold text-slate-200"> {t('IPA dosyasını indir','Download IPA file')}</a>}
 {!signedUrl&&<p className="mt-3 text-center text-xs text-slate-500">{t('Kurulum ve indirme bağlantıları imzalama bitince görünür.','Install and download links appear after signing.')}</p>}
 </div></section>
}

export function AccessGate() {
  const uiLanguage = useAppLanguage()
  const t = (tr: string, en: string) => uiLanguage === 'en' ? en : tr
  const [token, setToken] = React.useState('')
  const [user, setUser] = React.useState<User | null>(null)
  const [view, setView] = React.useState<'home' | 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'admin' | 'method' | 'signer'>(() => typeof window !== 'undefined' ? (window.location.pathname === '/verify-email' ? 'verify' : window.location.pathname === '/reset-password' ? 'reset' : 'home') : 'home')
  const [loginMode, setLoginMode] = React.useState<'member' | 'admin'>('member')
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [rememberMe, setRememberMe] = React.useState(() => typeof window !== 'undefined' && window.localStorage.getItem('mehmetipa.rememberMe') === 'true')
  const [rememberedAccount, setRememberedAccount] = React.useState(() => typeof window !== 'undefined' ? window.localStorage.getItem('mehmetipa.rememberedUsername') || '' : '')
  const [registrationRequests, setRegistrationRequests] = React.useState<RegistrationRequest[]>([])
  const [adminVipOrders, setAdminVipOrders] = React.useState<VipOrder[]>([])
  const [vipStatus, setVipStatus] = React.useState<VipStatus | null>(null)
  const [trialStatus, setTrialStatus] = React.useState<TrialStatus | null>(null)
  const [trialClock, setTrialClock] = React.useState(Date.now())
  React.useEffect(() => { const timer = window.setInterval(() => setTrialClock(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const [myVipOrders, setMyVipOrders] = React.useState<VipOrder[]>([])
  const [vipBusy, setVipBusy] = React.useState(false)
  const [usdTryRate, setUsdTryRate] = React.useState<number | null>(null)
  React.useEffect(() => {
    let active = true
    fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Kur alınamadı')))
      .then(data => {
        const rate = Number(data?.rates?.TRY)
        if (active && Number.isFinite(rate) && rate > 0) setUsdTryRate(rate)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  const [refreshing, setRefreshing] = React.useState<Record<string, boolean>>({})
  const [refreshFeedback, setRefreshFeedback] = React.useState<Record<string, string>>({})
  const refreshLocks = React.useRef<Set<string>>(new Set())
  const [registerName, setRegisterName] = React.useState('')
  const [registerUsername, setRegisterUsername] = React.useState('')
  const [registerEmail, setRegisterEmail] = React.useState('')
  const [registerPassword, setRegisterPassword] = React.useState('')
  const [registerPasswordAgain, setRegisterPasswordAgain] = React.useState('')
  const [forgotEmail, setForgotEmail] = React.useState('')
  const [verifyEmailInput, setVerifyEmailInput] = React.useState('')
  const [verifyPasswordInput, setVerifyPasswordInput] = React.useState('')
  const [resetPasswordValue, setResetPasswordValue] = React.useState('')
  const [resetPasswordAgain, setResetPasswordAgain] = React.useState('')
  const [resetToken, setResetToken] = React.useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('token') || '' : '')
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem('mehmetipa.pendingRegistration.v1')
      if (!raw) return
      const pending = JSON.parse(raw) as {name?:string;username?:string;email?:string;createdAt?:number}
      if (!pending.email || !pending.createdAt || Date.now() - pending.createdAt > 24*60*60*1000) {
        window.localStorage.removeItem('mehmetipa.pendingRegistration.v1')
        return
      }
      setRegisterName(pending.name || '')
      setRegisterUsername(pending.username || '')
      setRegisterEmail(pending.email)
      setVerifyEmailInput(pending.email)
      setView('verify')
      setNotice('Bekleyen kayıt işlemin bulundu. E-postanı doğrulayarak kaldığın yerden devam edebilirsin.')
    } catch {
      window.localStorage.removeItem('mehmetipa.pendingRegistration.v1')
    }
  }, [])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [users, setUsers] = React.useState<User[]>([])
  const [devices, setDevices] = React.useState<Device[]>([])
  const [adminTab, setAdminTab] = React.useState<'overview' | 'members' | 'devices' | 'system'>('overview')
  const [appleCheckBusy, setAppleCheckBusy] = React.useState(false)
  const [appleCheck, setAppleCheck] = React.useState<{connected:boolean;count:number;error?:string}|null>(null)
  const [appleDevices, setAppleDevices] = React.useState<AppleDeveloperDevice[]>([])
  const [presenceUsers, setPresenceUsers] = React.useState<PresenceUser[]>([])
  const [newName, setNewName] = React.useState('')
  const [newUsername, setNewUsername] = React.useState('')
  const [newEmail, setNewEmail] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [newGroup, setNewGroup] = React.useState('Standart')
  const [udid, setUdid] = React.useState('')
  const [myDevices, setMyDevices] = React.useState<Device[]>([])
  const [deviceStatusLoaded, setDeviceStatusLoaded] = React.useState(false)
  const [memberTab, setMemberTab] = React.useState<'games' | 'ipa' | 'account' | 'settings'>('games')
  const [certificate, setCertificate] = React.useState<{status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null>(null)
  const [p12File, setP12File] = React.useState<File|null>(null)
  const [profileFile, setProfileFile] = React.useState<File|null>(null)
  const [certificatePassword, setCertificatePassword] = React.useState('')
  const [currentLocation, setCurrentLocation] = React.useState(() => typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.hash}`)
  const isPublicDocument = /^\/(?:privacy|legal|refund)\/?(?:$|#)/.test(currentLocation) || /#(?:privacy|legal|refund)$/.test(currentLocation)

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
    const [u, d, c, p, r, v] = await Promise.all([
      api<{ users: User[] }>('/api/admin/users', activeToken),
      api<{ devices: Device[] }>('/api/admin/devices', activeToken),
      api<{ certificate: {status:string;certificate_name?:string;profile_name?:string;expires_at?:string}|null }>('/api/admin/certificate', activeToken),
      api<{ users: PresenceUser[] }>('/api/admin/presence', activeToken),
      api<{ requests: RegistrationRequest[] }>('/api/admin/registration-requests', activeToken),
      api<{ orders: VipOrder[] }>('/api/admin/vip-orders', activeToken),
    ])
    setUsers(u.users || [])
    setDevices(d.devices || [])
    setCertificate(c.certificate)
    setPresenceUsers(p.users || [])
    setRegistrationRequests(r.requests || [])
    setAdminVipOrders(v.orders || [])
  }, [])

  const loadMemberDevices = React.useCallback(async (activeToken: string) => {
    const result = await api<{ devices: Device[] }>('/api/devices', activeToken)
    setMyDevices(result.devices || [])
  }, [])

  const loadVip = React.useCallback(async (activeToken: string) => {
    const [status, orders, trial] = await Promise.all([
      api<VipStatus & { success:boolean }>('/api/vip/status', activeToken),
      api<{ orders: VipOrder[] }>('/api/vip/orders', activeToken),
      api<TrialStatus & { success:boolean }>('/api/trial/status', activeToken),
    ])
    setVipStatus(status)
    setMyVipOrders(orders.orders || [])
    setTrialStatus(trial)
  }, [])

  React.useEffect(() => {
    const handleCheckoutClosed = (event: Event) => {
      const orderId = (event as CustomEvent<{ orderId?: string }>).detail?.orderId
      if (!token || !orderId) return
      api('/api/vip/orders/' + encodeURIComponent(orderId) + '/cancel', token, {
        method: 'POST', body: '{}'
      }).then(async () => {
        await loadVip(token)
        setNotice('')
        setError('Ödeme iptal edildi. Herhangi bir tahsilat yapılmadı ve VIP üyeliğin etkinleştirilmedi.')
      }).catch(e => setError(e instanceof Error ? e.message : 'İptal durumu kaydedilemedi.'))
    }
    const handleCheckoutCompleted = () => {
      setError('')
      setNotice('Ödeme alındı. Paddle doğrulaması bekleniyor; VIP erişimi doğrulama tamamlanınca açılacak.')
    }
    window.addEventListener('mehmetipa:paddle-closed', handleCheckoutClosed)
    window.addEventListener('mehmetipa:paddle-completed', handleCheckoutCompleted)
    return () => {
      window.removeEventListener('mehmetipa:paddle-closed', handleCheckoutClosed)
      window.removeEventListener('mehmetipa:paddle-completed', handleCheckoutCompleted)
    }
  }, [token, loadVip])

  const runRefresh = async (key: string, label: string, loader: () => Promise<unknown>) => {
    if (refreshLocks.current.has(key)) return
    refreshLocks.current.add(key)
    setRefreshing(previous => ({ ...previous, [key]: true }))
    setRefreshFeedback(previous => ({ ...previous, [key]: '' }))
    try {
      await loader()
      setRefreshFeedback(previous => ({ ...previous, [key]: `${label} güncellendi ✓` }))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Yenileme başarısız.'
      setRefreshFeedback(previous => ({ ...previous, [key]: `Yenileme başarısız: ${message}` }))
      setError(message)
    } finally {
      refreshLocks.current.delete(key)
      setRefreshing(previous => ({ ...previous, [key]: false }))
    }
  }

  React.useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY)
    if (!saved) return
    let alive = true
    api<{ user?: User }>('/api/auth/me', saved).then((result) => {
      if (!alive) return
      const current = result?.user
      if (!current || !current.id || !['admin', 'member'].includes(current.role)) {
        window.sessionStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem(TOKEN_KEY)
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
    if (user.role === 'member' && view === 'method') loadVip(token).catch((e) => setError(e.message))
    // IPA/signing açılmadan önce cihaz engelini sunucudan doğrula.
    if (user.role === 'member' && (view === 'signer' || (view === 'method' && (memberTab === 'account' || memberTab === 'ipa')))) {
      setDeviceStatusLoaded(false)
      loadMemberDevices(token)
        .catch((e) => setError(e instanceof Error ? e.message : 'Cihaz bilgisi alınamadı.'))
        .finally(() => setDeviceStatusLoaded(true))
    }
  }, [token, user, view, memberTab, loadAdmin, loadMemberDevices, loadVip])


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
      if (rememberMe) {
        window.localStorage.setItem(TOKEN_KEY, result.token)
        window.localStorage.setItem('mehmetipa.rememberedUsername', result.user.username || username)
        window.localStorage.setItem('mehmetipa.rememberMe', 'true')
        setRememberedAccount(result.user.username || username)
      } else {
        window.sessionStorage.setItem(TOKEN_KEY, result.token)
        window.localStorage.removeItem(TOKEN_KEY)
        window.localStorage.removeItem('mehmetipa.rememberMe')
        window.localStorage.removeItem('mehmetipa.rememberedUsername')
        setRememberedAccount('')
      }
      setToken(result.token); setUser(result.user)
      setView(result.user.role === 'admin' ? 'admin' : 'method')
      setPassword('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Giriş başarısız.') }
    finally { setBusy(false) }
  }

  const PENDING_REGISTRATION_KEY = 'mehmetipa.pendingRegistration.v1'
  const register = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    if (registerPassword !== registerPasswordAgain) { setBusy(false); setError('Şifreler eşleşmiyor.'); return }
    const email = registerEmail.trim().toLowerCase()
    let firebaseIdToken = ''
    try {
      let account: {idToken:string}
      try {
        account = await firebaseIdentityRequest<{idToken:string}>('accounts:signUp',{email,password:registerPassword,returnSecureToken:true})
      } catch (signupError) {
        const message = signupError instanceof Error ? signupError.message : ''
        if (!message.includes('daha önce kayıt başlatılmış')) throw signupError
        account = await firebaseIdentityRequest<{idToken:string}>('accounts:signInWithPassword',{email,password:registerPassword,returnSecureToken:true})
      }
      firebaseIdToken = account.idToken
      await api('/api/auth/register',undefined,{method:'POST',body:JSON.stringify({name:registerName,username:registerUsername,email,password:registerPassword,firebaseIdToken})})
      const pending = {name:registerName,username:registerUsername,email,createdAt:Date.now()}
      window.localStorage.setItem(PENDING_REGISTRATION_KEY,JSON.stringify(pending))
      setVerifyEmailInput(email)
      setVerifyPasswordInput('')
      setView('verify')
      setNotice('Doğrulama bağlantısını e-posta adresine gönderdik. Gelen kutunu ve spam klasörünü kontrol et. Sayfayı yenilesen bile bu adım korunacak.')
      setRegisterPassword(''); setRegisterPasswordAgain('')
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Kayıt başlatılamadı.')
    }
    finally { setBusy(false) }
  }
  const requestPasswordReset = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { const result=await api<{message:string}>('/api/auth/forgot-password',undefined,{method:'POST',body:JSON.stringify({email:forgotEmail})}); setNotice(result.message) } catch(e) { setError(e instanceof Error ? e.message : 'İstek gönderilemedi.') } finally { setBusy(false) } }
  const resetPassword = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); if(resetPasswordValue!==resetPasswordAgain){setBusy(false);setError('Şifreler eşleşmiyor.');return} try { const result=await api<{message:string}>('/api/auth/reset-password',undefined,{method:'POST',body:JSON.stringify({token:resetToken,password:resetPasswordValue})}); setNotice(result.message); setResetPasswordValue('');setResetPasswordAgain('') } catch(e) { setError(e instanceof Error ? e.message : 'Şifre yenilenemedi.') } finally { setBusy(false) } }
  const verifyRegistrationEmail = React.useCallback(async () => {
    const legacyToken = new URLSearchParams(window.location.search).get('token') || ''
    if (!legacyToken) return
    try {
      const result=await api<{message:string}>('/api/auth/verify-email',undefined,{method:'POST',body:JSON.stringify({token:legacyToken})})
      const raw=window.localStorage.getItem('mehmetipa.pendingRegistration.v1')
      const pending=raw ? JSON.parse(raw) as {email?:string} : null
      if (pending?.email) setUsername(pending.email)
      window.localStorage.removeItem('mehmetipa.pendingRegistration.v1')
      setNotice(result.message+' Giriş yaparak devam edebilirsin.')
      setView('login')
      setLoginMode('member')
    } catch(e) { setError(e instanceof Error ? e.message : 'E-posta doğrulanamadı.') }
  },[])
  React.useEffect(() => {
    if (view === 'verify') verifyRegistrationEmail().catch(() => {})
  }, [view, verifyRegistrationEmail])

  const resendFirebaseVerification = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const signedIn = await firebaseIdentityRequest<{idToken:string}>('accounts:signInWithPassword',{email:verifyEmailInput.trim().toLowerCase(),password:verifyPasswordInput,returnSecureToken:true})
      await api('/api/auth/register',undefined,{method:'POST',body:JSON.stringify({name:registerName,username:registerUsername,email:verifyEmailInput.trim().toLowerCase(),password:verifyPasswordInput,firebaseIdToken:signedIn.idToken})})
      setNotice('Yeni doğrulama bağlantısını gönderdik. Gelen kutunu ve spam klasörünü kontrol et.')
    } catch(e) {
      setError(e instanceof Error ? e.message : 'Doğrulama e-postası gönderilemedi.')
    } finally { setBusy(false) }
  }
  const completeFirebaseVerification = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const signedIn = await firebaseIdentityRequest<{idToken:string}>('accounts:signInWithPassword',{email:verifyEmailInput.trim().toLowerCase(),password:verifyPasswordInput,returnSecureToken:true})
      const result = await api<{message:string}>('/api/auth/verify-email',undefined,{method:'POST',body:JSON.stringify({idToken:signedIn.idToken})})
      setNotice(result.message)
      window.localStorage.removeItem(PENDING_REGISTRATION_KEY)
      setVerifyPasswordInput('')
      setView('login')
      setLoginMode('member')
      setUsername(verifyEmailInput.trim().toLowerCase())
      setPassword('')
    } catch(e) { setError(e instanceof Error ? e.message : 'E-posta doğrulaması tamamlanamadı.') }
    finally { setBusy(false) }
  }

  const reviewRegistration = async (request: RegistrationRequest, action: 'approve'|'reject'|'reopen') => { if(!token)return; setError('');setNotice('');try{await api('/api/admin/registration-requests/'+encodeURIComponent(request.id),token,{method:'POST',body:JSON.stringify({action})});await loadAdmin(token);setNotice(action==='approve'?'Başvuru kabul edildi, hesap açıldı.':action==='reject'?'Başvuru reddedildi.':'Başvuru yeniden incelemeye alındı.')}catch(e){setError(e instanceof Error?e.message:'Başvuru işlenemedi.')} }

  const reviewVipOrder = async (order: VipOrder, action: 'approve'|'reject') => {
    if (!token) return
    setError(''); setNotice('')
    try {
      await api('/api/admin/vip-orders/' + encodeURIComponent(order.id), token, { method:'POST', body:JSON.stringify({ action }) })
      await loadAdmin(token)
      setNotice(action === 'approve' ? 'VIP üyeliği etkinleştirildi.' : 'VIP talebi reddedildi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'VIP talebi işlenemedi.') }
  }
  const createVipOrder = async (planCode: string) => {
    if (!token || !user) return
    setVipBusy(true); setError(''); setNotice('')
    try {
      const result = await api<{ order: { id: string; plan_code: string } }>('/api/vip/orders', token, { method:'POST', body:JSON.stringify({ plan_code:planCode }) })
      await openPaddleCheckout(result.order)
      await loadVip(token)
      setNotice('Güvenli ödeme penceresi açıldı. VIP erişimi yalnızca ödeme doğrulandıktan sonra etkinleşir.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Ödeme ekranı açılamadı.') }
    finally { setVipBusy(false) }
  }
  const startTrial = async () => {
    if (!token || vipBusy) return
    setVipBusy(true); setError(''); setNotice('')
    try {
      await api('/api/trial/start', token, { method: 'POST', body: '{}' })
      await loadVip(token)
      setNotice('1 saatlik ücretsiz denemen başladı. Süre sunucu saatine göre işlemeye başladı.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Deneme başlatılamadı.') }
    finally { setVipBusy(false) }
  }

  const deleteMyDevice = async (deviceId: string) => {
    if (!token || !window.confirm('Bu UDID kaydını Mehmet IPA hesabından silmek istiyor musun? Apple Developer kaydı varsa bu işlem onu silmez. Deneme hakkın sıfırlanmaz.')) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/devices/' + encodeURIComponent(deviceId), token, { method: 'DELETE' })
      await loadMemberDevices(token)
      setNotice('UDID kaydı hesabından silindi. Ücretsiz deneme hakkın sıfırlanmadı.')
    } catch (e) { setError(e instanceof Error ? e.message : 'UDID silinemedi.') }
    finally { setBusy(false) }
  }

  const logout = () => {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(TOKEN_KEY)
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
          p12_base64: p12Base64,
          profile_base64: profileBase64,
        }),
      })
      setP12File(null); setProfileFile(null); setCertificatePassword('')
      setNotice('Tamamlandı: P12, profil ve parola şifrelenerek özel kasaya kaydedildi.')
      await loadAdmin(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sertifika yüklenemedi.')
    } finally { setBusy(false) }
  }

  const deleteCertificate = async () => {
    if (!token || !certificate) return
    if (!window.confirm('Mevcut P12 sertifikası ve provisioning profile kalıcı olarak silinsin mi?')) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api('/api/admin/certificate', token, { method: 'DELETE' })
      setNotice('Sertifika ve özel kasadaki dosyaları silindi.')
      await loadAdmin(token)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sertifika silinemedi.')
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

  const manageVip = async (target: User, action: 'unlimited'|'extend'|'extend_time'|'block'|'unblock'|'revoke', amount?: number) => {
    if (!token) return
    const labels: Record<string, string> = { unlimited: 'Sınırsız VIP verilsin mi?', extend: `${amount} gün VIP eklensin mi?`, extend_time: `${amount} dakika VIP eklensin mi?`, block: 'Bu üyenin VIP erişimi engellensin mi?', unblock: 'VIP erişim engeli kaldırılsın mı?', revoke: 'VIP üyeliği tamamen kaldırılsın mı?' }
    if (!window.confirm(labels[action])) return
    setError(''); setNotice('')
    try {
      const body: Record<string, unknown> = action === 'unlimited' ? { plan_code: 'unlimited' } : { action }
      if (amount && action === 'extend') body.days = amount
      if (amount && action === 'extend_time') body.minutes = amount
      const result = await api<{ apple_device_sync?: { ok: boolean; outcomes?: Array<{ error?: string }> } }>(`/api/admin/users/${encodeURIComponent(target.id)}/vip`, token, { method: 'POST', body: JSON.stringify(body) })
      await loadAdmin(token)
      const appleError = result.apple_device_sync?.outcomes?.find(item => item.error)?.error
      if (result.apple_device_sync && !result.apple_device_sync.ok) {
        setError(`VIP bilgisi güncellendi; ancak Apple cihaz durumu güncellenemedi: ${appleError || 'Apple API hatası'}`)
      } else {
        setNotice(`@${target.username} VIP bilgisi güncellendi.`)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'VIP işlemi başarısız.') }
  }

  const deleteUser = async (target: User) => {
    const isEnglish = window.localStorage.getItem('mehmetipa.language') === 'en'; const message = isEnglish ? `Delete the ${target.username} account and its device registrations?` : `${target.username} hesabı ve cihaz kayıtları silinsin mi?`; if (!token || !window.confirm(message)) return
    try {
      await api(`/api/admin/users/${encodeURIComponent(target.id)}`, token, { method: 'DELETE' })
      await loadAdmin(token); setNotice('Kullanıcı silindi.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Silme başarısız.') }
  }

  const testAppleConnection = async () => {
    if (!token || appleCheckBusy) return
    setAppleCheckBusy(true)
    setAppleCheck(null)
    try {
      const result = await api<{ connected: boolean; count?: number; devices?: AppleDeveloperDevice[]; error?: string }>('/api/admin/apple/devices', token)
      const listedDevices = result.devices || []
      setAppleDevices(listedDevices)
      setAppleCheck({ connected: !!result.connected, count: result.count ?? listedDevices.length })
    } catch (e) {
      setAppleCheck({ connected: false, count: 0, error: e instanceof Error ? e.message : 'Apple bağlantısı test edilemedi.' })
    } finally {
      setAppleCheckBusy(false)
    }
  }

  const updateDevice = async (device: Device, status: Device['status']) => {
    if (!token) return
    try {
      const result = await api<{
        apple_device_sync?: { ok: boolean; outcomes?: Array<{ error?: string }> }
        profile?: { ok?: boolean; pending?: boolean; error?: string }
      }>(`/api/admin/devices/${encodeURIComponent(device.id)}`, token, { method: 'PATCH', body: JSON.stringify({ status }) })
      await loadAdmin(token)
      const appleError = result.apple_device_sync?.outcomes?.find(item => item.error)?.error
      if (result.apple_device_sync && !result.apple_device_sync.ok) {
        setError(`Apple cihaz işlemi başarısız: ${appleError || 'Apple API hatası'}`)
      } else if (result.profile && !result.profile.ok && !result.profile.pending) {
        setError(`Apple cihazı güncellendi fakat Ad Hoc profil üretilemedi: ${result.profile.error || 'Profil hatası'}`)
      } else if (status === 'approved' && result.profile?.pending) {
        setNotice('Apple cihazı onaylandı. Apple işlemi tamamlanınca Ad Hoc profili otomatik hazırlanacak.')
      } else if (status === 'approved' && result.profile?.ok) {
        setNotice('Cihaz Apple hesabına kaydedildi ve cihaza özel Ad Hoc profili hazırlandı.')
      } else {
        setNotice('Cihaz durumu ve Apple erişimi güncellendi.')
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Cihaz güncellenemedi.') }
  }

  const resetDeviceUdid = async (device: Device) => {
    if (!token) return
    const isEnglish = typeof window !== 'undefined' && window.localStorage.getItem('mehmetipa.language') === 'en'
    const prompt = isEnglish
      ? `Clear only the Mehmet IPA UDID entry for ${device.name || device.username || 'this member'}? Apple Developer devices and profiles will NOT be changed.`
      : `${device.name || device.username || 'Bu üye'} için yalnızca Mehmet IPA'daki UDID giriş kaydı sıfırlansın mı? Apple Developer cihazlarına ve profillerine KESİNLİKLE dokunulmayacak.`
    if (!window.confirm(prompt)) return
    setError(''); setNotice(isEnglish ? 'Clearing local UDID entry…' : 'Mehmet IPA UDID kaydı temizleniyor…')
    try {
      await api(`/api/admin/devices/${encodeURIComponent(device.id)}/reset-udid`, token, { method: 'POST' })
      await loadAdmin(token)
      setNotice(isEnglish
        ? 'Local UDID entry cleared. Apple Developer was not changed.'
        : 'UDID giriş alanı sıfırlandı. Apple Developer tarafında hiçbir işlem yapılmadı.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'UDID kaydı sıfırlanamadı.')
    }
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
if (view === 'method' && user?.role === 'member') return <main className="relative min-h-screen bg-[#070A16] bg-[radial-gradient(ellipse_at_10%_0%,rgba(124,58,237,.18),transparent_34%),radial-gradient(ellipse_at_95%_35%,rgba(6,182,212,.10),transparent_30%),linear-gradient(180deg,#080b18,#090d1b_55%,#070a14)] px-4 pb-28 pt-5 text-white sm:px-6">
  <div aria-hidden="true" className="pointer-events-none fixed -right-32 top-20 h-96 w-96 rounded-full bg-violet-600/15 blur-3xl" />
  <div className="relative mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-violet-300/20 bg-[#11182c]/85 px-4 py-3 shadow-[0_18px_55px_rgba(0,0,0,.24)] backdrop-blur-xl">
      <div className="flex items-center gap-3"><img src="/icon-dark-512.PNG" alt="Mehmet IPA" className="h-10 w-10 rounded-xl" /><div><div className="font-bold">Mehmet IPA</div><div className="text-xs text-slate-400">Oyuncu merkezi</div></div></div>
      <div className="flex flex-wrap items-center gap-2"><div id="language-picker-slot" className="shrink-0" /><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">● Hesap aktif</span></div>
    </header>
    {isInstalledApp && availableUpdate && <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
      <div><div className="font-semibold text-cyan-100">Yeni sürüm mevcut · v{availableUpdate.version}</div><p className="mt-1 text-sm text-slate-300">{availableUpdate.notes || 'Mehmet IPA’nın yeni sürümü hazır.'}</p></div>
      <a href={availableUpdate.ipaUrl} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">IPA’yı Güncelle</a>
    </section>}
    {memberTab === 'games' && <div className="mt-6">
      <section className="overflow-hidden rounded-[28px] border border-violet-300/25 bg-[radial-gradient(circle_at_90%_5%,rgba(34,211,238,.12),transparent_32%),linear-gradient(125deg,rgba(91,33,182,.28),rgba(30,41,92,.24)_55%,rgba(8,145,178,.12))] p-6 shadow-[0_25px_70px_rgba(0,0,0,.22)] sm:p-9"><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200">Oyun dünyası</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Hoş geldin, {user.name}!</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Modlu oyunları keşfet, IPA dosyalarını kendi sertifikanla imzala ve iPhone’una yüklemeye hazırla. Oyunlar, rehberler ve imzalama araçları tek yerde.</p><a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold">✈️ Telegram destek</a></section>
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
    {memberTab === 'ipa' && (vipStatus === null || !deviceStatusLoaded ? <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.045] p-6 text-center"><p className="text-sm text-slate-400">{t('VIP ve cihaz güvenliği kontrol ediliyor…','Checking VIP and device security…')}</p></section> : (vipStatus.is_vip || trialStatus?.active) ? (myDevices.find(device => device.status === 'blocked') ? <BlockedDeviceNotice device={myDevices.find(device => device.status === 'blocked')!} /> : <MemberSigningPanel username={user.username} token={token} onHome={() => setMemberTab('games')} onLogout={logout} />) : <section className="mt-8 rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-500/10 via-[#11182c] to-cyan-500/10 p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-200">{t('ÜYELİK SEVİYESİ','MEMBERSHIP')}</p><h1 className="mt-2 text-3xl font-black">{t('VIP imzalama kilitli','VIP signing is locked')}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{t('IPA imzalama alanını açmak için bir VIP paketi seç. Ücretsiz hesabınla oyunları ve diğer üye alanlarını kullanmaya devam edebilirsin.','Choose a VIP plan to unlock IPA signing. You can continue using games and other member areas with your free account.')}</p></div><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-200">{t('STANDART ÜYELİK','STANDARD')}</span></div><div className="mt-6 rounded-2xl border border-emerald-300/25 bg-emerald-400/[.06] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-200">ÜCRETSİZ DENEME</p><h2 className="mt-1 text-xl font-black text-white">1 saatlik ücretsiz denemeye başla</h2></div><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100">60 DAKİKA</span></div><p className="mt-3 text-xs leading-5 text-slate-300">Deneme başladığında 60 dakikalık süre hemen işlemeye başlar.</p><div className="mt-3 rounded-xl border border-red-400/35 bg-red-500/[.10] p-3"><p className="text-xs font-black uppercase tracking-wide text-red-300">DİKKAT · Deneme ve VIP süresi bitince</p><p className="mt-1 text-xs leading-5 text-red-100">Ücretsiz deneme veya VIP üyelik süreniz sona erdiğinde IPA imzalama ve yeni uygulama indirme bölümü kilitlenir. Mehmet IPA üzerinden daha önce indirdiğiniz uygulamalar da sertifika durumuna bağlı olarak çalışmayı durdurabilir. Hizmetleri yeniden kullanabilmek için üyeliğinizi yenilemeniz ve aktif bir VIP pakete sahip olmanız gerekir.</p></div>{trialStatus?.started ? <p className="mt-3 text-xs font-semibold text-amber-200">Bu hesap deneme hakkını daha önce kullanmış. {trialStatus.expires_at && new Date(trialStatus.expires_at).getTime() <= Date.now() ? 'Deneme süresi sona erdi.' : 'Deneme hakkı kullanılmış.'}</p> : !trialStatus?.has_approved_device ? <div className="mt-3"><p className="text-xs text-amber-100">Denemeyi başlatmadan önce Hesabım bölümünden UDID kaydı gönderilmeli ve yönetici onayı alınmalı.</p><button type="button" onClick={()=>setMemberTab('account')} className="mt-3 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white">Hesabım · UDID kaydı</button></div> : <button type="button" disabled={vipBusy || !trialStatus?.can_start} onClick={startTrial} className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3.5 text-sm font-black text-slate-950 disabled:opacity-50">{vipBusy?'Deneme başlatılıyor…':'1 saatlik ücretsiz denemeyi başlat →'}</button>}</div><div className="mt-6 grid gap-3 sm:grid-cols-2">{[{code:'month',name:t('1 Aylık VIP','1 Month VIP'),amount:450,detail:t('30 gün VIP erişimi','30 days of VIP access')},{code:'quarter',name:t('3 Aylık VIP','3 Months VIP'),amount:800,detail:t('90 gün VIP erişimi','90 days of VIP access'),popular:true}].map(plan=><article key={plan.code} className={'group relative overflow-hidden rounded-2xl border p-5 transition duration-200 hover:-translate-y-1 '+(plan.popular?'border-violet-300/55 bg-gradient-to-br from-violet-500/20 via-indigo-500/10 to-cyan-500/[.06] shadow-[0_18px_45px_rgba(109,40,217,.16)]':'border-white/10 bg-gradient-to-br from-white/[.07] to-black/25')}><div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold text-white">{plan.name}</div><p className="mt-1 text-xs text-slate-400">{plan.detail}</p></div>{plan.popular&&<span className="rounded-full border border-violet-300/25 bg-violet-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-violet-200">{t('Avantajlı','Best value')}</span>}</div><div className="mt-5 text-3xl font-black tracking-tight text-white">{plan.amount.toLocaleString('tr-TR')} TL</div><div className="mt-1 text-sm font-semibold text-cyan-200">{usdTryRate?('≈ '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(plan.amount/usdTryRate)):t('USD kuru yükleniyor…','Loading USD rate…')}</div><p className="mt-3 text-[11px] leading-5 text-slate-400">{t('Dolar karşılığı yaklaşık tutardır; tahsilat TL üzerinden yapılır.','USD amount is an estimate; the charge is made in TRY.')}</p><button type="button" disabled={vipBusy} onClick={()=>createVipOrder(plan.code)} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500 px-4 py-3 text-sm font-extrabold text-white shadow-lg shadow-violet-950/30 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-50">{vipBusy?t('Ödeme hazırlanıyor…','Preparing checkout…'):t('VIP Satın Al','Buy VIP')} <span aria-hidden="true">→</span></button></article>)}</div><div className="mt-5 rounded-2xl border border-emerald-300/15 bg-emerald-300/[.06] p-4"><p className="text-sm font-semibold text-emerald-100">{t('Güvenli ödeme · Paddle','Secure checkout · Paddle')}</p><p className="mt-1 text-xs leading-5 text-slate-300">{t('Kart bilgilerin Paddle tarafından güvenli şekilde işlenir. VIP üyeliğin yalnızca ödeme doğrulandıktan sonra otomatik açılır.','Your card details are securely processed by Paddle. VIP access is activated automatically only after payment is verified.')}</p></div>{(error||notice)&&<div className="mt-4"><ErrorText error={error}/><NoticeText notice={notice}/></div>}</section>)}
    {memberTab === 'account' && <section className="mt-8 grid gap-4 lg:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><h1 className="text-2xl font-black">Hesabım</h1><p className="mt-3 text-sm text-slate-300">{user.name}</p><p className="text-sm text-slate-400">@{user.username}</p><div className="mt-4 inline-flex rounded-full bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">Hesap durumu: Aktif</div><div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4"><div className="text-xs font-semibold text-muted-foreground">VIP üyelik durumu</div><div className="mt-1 font-bold">{vipStatus?.is_vip ? (vipStatus.plan === 'unlimited' ? '♾️ Sınırsız VIP' : '⭐ Aktif VIP') : trialStatus?.started && trialStatus.expires_at && new Date(trialStatus.expires_at).getTime() > trialClock ? '⏱️ 1 Saatlik Deneme' : trialStatus?.started ? 'Deneme süresi sona erdi' : 'Standart üyelik'}</div>{vipStatus?.is_vip && <div className="mt-1 text-sm text-muted-foreground">{vipStatus.expires_at ? `Bitiş tarihi: ${new Date(vipStatus.expires_at).toLocaleDateString(getAppLocale())}` : 'Süre sınırı yok'}</div>}{!vipStatus?.is_vip && trialStatus?.started && trialStatus.expires_at && <div className="mt-1 text-sm font-semibold text-emerald-300">{new Date(trialStatus.expires_at).getTime() > trialClock ? (() => { const remaining = Math.max(0, new Date(trialStatus.expires_at!).getTime() - trialClock); const hours = Math.floor(remaining / 3600000); const minutes = Math.floor((remaining % 3600000) / 60000); const seconds = Math.floor((remaining % 60000) / 1000); return `Kalan deneme süresi: ${hours > 0 ? hours + ' saat ' : ''}${minutes} dakika ${seconds} saniye` })() : 'Deneme süresi sona erdi · Yeni imzalama kapalı'}</div>}<button type="button" onClick={() => void runRefresh('member-vip', 'VIP durumu', () => loadVip(token))} disabled={!!refreshing['member-vip']} className="mt-3 rounded-lg border px-3 py-2 text-xs transition disabled:cursor-wait disabled:opacity-60">{refreshing['member-vip'] ? 'Yenileniyor…' : 'VIP durumunu yenile'}</button>{refreshFeedback['member-vip'] && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{refreshFeedback['member-vip']}</p>}</div></div><div className="rounded-2xl border border-white/10 bg-white/[0.045] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-bold">Kayıtlı cihazın</h2><button type="button" onClick={() => void runRefresh('member-devices', 'Cihaz listesi', () => loadMemberDevices(token))} disabled={!!refreshing['member-devices']} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition disabled:cursor-wait disabled:opacity-60">{refreshing['member-devices'] ? 'Yenileniyor…' : 'Yenile'}</button></div><section className="mt-4 rounded-xl border border-cyan-300/20 bg-cyan-400/[.06] p-4"><div className="flex items-center gap-2"><span className="text-xl">📱</span><h3 className="font-bold text-cyan-100">UDID’mi nasıl bulurum?</h3></div><p className="mt-2 text-xs leading-5 text-slate-300">iPhone’un Ayarlar menüsünde UDID doğrudan görünmez. Aşağıdaki sayfayı iPhone’unda Safari ile açarak cihaz kimliğini alabilirsin.</p><a href="https://get.udid.io/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950">UDID alma sayfasını aç ↗</a><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-300"><li>Bağlantıyı iPhone’unda Safari ile aç ve ekrandaki UDID alma adımlarını izle.</li><li>Profil indirilirse Ayarlar’da “Profil İndirildi” bölümünden yükle; sayfanın gösterdiği UDID’yi kopyala.</li><li>Kopyaladığın UDID’yi bu sayfadaki “Cihaz UDID” alanına yapıştırıp onaya gönder.</li></ol><p className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/[.07] p-2.5 text-[11px] leading-5 text-amber-100">Güvenlik: Yapılandırma profilini yalnızca ne yaptığını anlayarak yükle. UDID’yi aldıktan sonra artık gerekmiyorsa Ayarlar → Genel → VPN ve Aygıt Yönetimi bölümünden indirdiğin profili kaldır.</p></section><ErrorText error={error} /><NoticeText notice={notice} />{refreshFeedback['member-devices'] && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{refreshFeedback['member-devices']}</p>}{myDevices.length > 0 ? <div className="mt-4 grid gap-3">{myDevices.map(d => <div key={d.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="break-all text-xs text-slate-300">{d.udid}</p><div className="mt-3 flex items-center gap-2">{d.status === 'approved' ? <><span className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-sm font-semibold text-emerald-300">Cihaz onaylandı</span></> : d.status === 'blocked' ? <><span className="h-2 w-2 rounded-full bg-red-400" /><span className="text-sm font-semibold text-red-300">Cihaz engellendi · Yöneticiyle iletişime geç</span></> : <><span className="h-2 w-2 rounded-full bg-amber-400" /><span className="text-sm font-semibold text-amber-300">Yönetici onayı bekleniyor</span></>}</div></div>)}</div> : <><p className="mt-3 text-sm text-slate-400">Henüz kayıtlı cihazın yok. UDID değerini yalnızca ilk kayıt için gir.</p><form onSubmit={registerDevice} className="mt-4 grid gap-3"><Field label="Cihaz UDID" value={udid} onChange={e => setUdid(e.target.value)} placeholder="UDID değerini gir" required /><button type="submit" disabled={busy} aria-live="polite" className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">{busy ? "⏳ Gönderiliyor..." : "Cihazı onaya gönder →"}</button></form></>}</div></section>}
    {memberTab === 'settings' && <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.045] p-6"><h1 className="text-2xl font-black">Ayarlar</h1><p className="mt-2 text-sm text-slate-400">Hesap ve destek işlemleri</p><a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-6 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">Telegram destek <span>↗</span></a><a href="https://www.tiktok.com/@m3hm3t_m" target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 text-sm font-semibold">TikTok · @m3hm3t_m <span>↗</span></a><button onClick={logout} className="mt-6 w-full rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200">{t('Çıkış yap','Log out')}</button></section>}
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-violet-300/15 bg-[#090D1B]/95 px-2 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,.25)] backdrop-blur-2xl"><div className="mx-auto grid max-w-lg grid-cols-4 gap-1">
      {([{id:'games',label:'Games',icon:'🎮'},{id:'ipa',label:'IPA',icon:'✍️'},{id:'account',label:'Hesabım',icon:'👤'},{id:'settings',label:'Ayarlar',icon:'⚙️'}] as const).map(tab => <button key={tab.id} onClick={() => setMemberTab(tab.id)} className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${memberTab === tab.id ? 'bg-violet-500/20 text-violet-200' : 'text-slate-400 hover:bg-white/5'}`}><span className="text-lg">{tab.icon}</span>{tab.id === 'games' ? t('Oyunlar','Games') : tab.label}</button>)}
    </div></nav>
  </div>
</main>
  if (view === 'signer' && user?.role === 'member') return !deviceStatusLoaded ? <main className="min-h-screen bg-[#080B18] p-6 text-center text-slate-300">Cihaz güvenliği kontrol ediliyor…</main> : (myDevices.find(device => device.status === 'blocked') ? <main className="min-h-screen bg-[#080B18] px-4 py-8 text-white"><div className="mx-auto max-w-xl"><BlockedDeviceNotice device={myDevices.find(device => device.status === 'blocked')!} /><button onClick={() => { setView('method'); setMemberTab('account') }} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold">Hesabıma dön</button></div></main> : <MemberSigningPanel username={user.username} token={token} onHome={() => { setView('method'); setMemberTab('games') }} onLogout={logout} />)

  if (view === 'login') return <main className="auth-screen-enter relative flex min-h-screen items-center justify-center overflow-hidden bg-[#080B18] px-4 py-10 text-white"><style>{`@keyframes authScreenEnter{0%{opacity:0;transform:translateY(20px) scale(.985);filter:blur(5px)}100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0)}}.auth-screen-enter{animation:authScreenEnter .48s cubic-bezier(.2,.75,.25,1) both}.auth-panel{box-shadow:0 32px 100px rgba(0,0,0,.5),inset 0 1px rgba(255,255,255,.06)}@media(prefers-reduced-motion:reduce){.auth-screen-enter{animation:none}}
/* Professional product UI: restrained surfaces, consistent spacing and clear hierarchy. */
.mi-public{background:#0b1220!important;color:#e5eaf2!important}
.mi-public .mi-header{top:8px;border:1px solid #263449!important;border-radius:16px!important;background:rgba(15,23,42,.96)!important;box-shadow:0 8px 28px rgba(0,0,0,.18)!important;backdrop-filter:blur(14px)}
.mi-public .mi-intro{border:1px solid #263449!important;border-radius:20px!important;background:#111c2e!important;box-shadow:none!important}
.mi-public .mi-intro p:first-child{color:#93c5fd!important;letter-spacing:.14em!important}
.mi-public .mi-intro h2{max-width:760px;font-size:clamp(1.75rem,4vw,2.65rem)!important;line-height:1.15!important;letter-spacing:-.035em!important}
.mi-public .mi-feature{min-height:132px!important;border:1px solid #2a3a50!important;border-radius:14px!important;background:#172438!important;box-shadow:none!important;transition:border-color .18s,background .18s!important}
.mi-public .mi-feature:hover{transform:none!important;border-color:#5286c7!important;background:#1b2c43!important;box-shadow:none!important}
.mi-public .mi-feature>div:first-child{width:38px;height:38px;border-radius:11px;background:#223b5b!important;font-size:21px}
.mi-public .mi-hero{border:1px solid #263449!important;border-radius:22px!important;background:#101b2c!important;box-shadow:none!important}
.mi-public .mi-hero h1{font-size:clamp(2.2rem,5vw,3.7rem)!important;line-height:1.08!important;letter-spacing:-.045em!important}
.mi-public .mi-hero h1 .text-transparent{background:none!important;color:#93c5fd!important;-webkit-text-fill-color:#93c5fd!important}
.mi-public .mi-console{border:1px solid #30445e!important;border-radius:20px!important;background:#142238!important;box-shadow:0 18px 45px rgba(0,0,0,.22)!important}
.mi-public .mi-console>div:nth-child(2){border:1px solid #30445e!important;border-radius:16px!important;background:#0f1b2d!important;box-shadow:none!important;backdrop-filter:none!important}
.mi-public .mi-console .bg-gradient-to-br{background:#25466c!important}
.mi-public .mi-console button{background:#2563eb!important;color:#fff!important;box-shadow:none!important}
.mi-public .mi-catalog{border-top:1px solid #263449!important}
.mi-public .mi-catalog h2{letter-spacing:-.035em!important}
.mi-public article{box-shadow:none!important}
.mi-public .mi-vip{border:1px solid #263449!important;border-radius:20px!important;background:#111c2e!important}
.mi-public .mi-vip article,.mi-public .mi-vip article:nth-child(2){border:1px solid #2a3a50!important;border-radius:15px!important;background:#172438!important;box-shadow:none!important}
.mi-public .mi-vip article:nth-child(2){border-color:#4775ae!important;background:#1a2b43!important}
.mi-public .bg-gradient-to-r{background:#2563eb!important;color:#fff!important;box-shadow:none!important}
.mi-public .bg-gradient-to-b{background:#1a2b43!important}
.mi-public .shadow-xl,.mi-public .shadow-lg{box-shadow:none!important}
.mi-public footer{border-color:#263449!important}
.mi-public a,.mi-public button{transition:background-color .16s,border-color .16s,color .16s}
.mi-public button:focus-visible,.mi-public a:focus-visible{outline:2px solid #60a5fa!important;outline-offset:3px}
@media(max-width:640px){.mi-public{padding:12px!important}.mi-public .mi-header{top:4px;border-radius:14px!important}.mi-public .mi-intro{border-radius:16px!important;padding:20px!important}.mi-public .mi-hero{border-radius:18px!important;padding:22px 16px!important}.mi-public .mi-vip{padding:16px!important}.mi-public .mi-feature{min-height:118px!important}}
`}</style>
    <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-10 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
    <div className="auth-panel relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#111526]/95 ring-1 ring-white/[0.06] backdrop-blur-2xl lg:grid-cols-[1fr_.9fr]">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-violet-600/30 via-indigo-600/20 to-cyan-500/10 p-10 lg:flex"><div><Brand /><p className="mt-16 text-xs font-bold uppercase tracking-[.2em] text-cyan-200">Mehmet IPA üyelik</p><h1 className="mt-4 text-4xl font-black leading-tight">Oyun ve imzalama dünyana hoş geldin.</h1><p className="mt-4 max-w-sm text-sm leading-7 text-slate-300">Hesabına giriş yap; IPA imzalama araçlarına, oyun vitrinine ve Türkçe emülatör rehberlerine ulaş.</p></div><div className="grid grid-cols-3 gap-3"><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">🎮</div><div className="mt-1 text-xs text-slate-300">Oyunlar</div></div><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">🔐</div><div className="mt-1 text-xs text-slate-300">Sertifikalar</div></div><div className="rounded-xl border border-white/10 bg-black/15 p-3 text-center"><div className="text-2xl">⚡</div><div className="mt-1 text-xs text-slate-300">IPA imzalama</div></div></div></div>
      <section className="p-6 sm:p-10"><div className="lg:hidden"><Brand /></div><div className="mt-8 lg:mt-4"><div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${loginMode === 'admin' ? 'border-amber-300/25 bg-amber-400/10 text-amber-200' : 'border-violet-300/20 bg-violet-400/10 text-violet-200'}`}>{loginMode === 'admin' ? t('YÖNETİCİ GİRİŞİ','ADMINISTRATOR SIGN-IN') : t('ÜYE GİRİŞİ','MEMBER SIGN-IN')}</div><h2 className="mt-4 text-3xl font-black tracking-tight">{loginMode === 'admin' ? t('Yönetim paneline hoş geldin.','Welcome to the admin panel.') : t('Tekrar hoş geldin.','Welcome back.')}</h2><p className="mt-2 text-sm leading-6 text-slate-400">{loginMode === 'admin' ? t('Yönetici hesabınla güvenli şekilde devam et.','Continue securely with your administrator account.') : t('Devam etmek için hesap bilgilerini gir.','Enter your account details to continue.')}</p><div className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" onClick={()=>{setLoginMode('member');setError('')}} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${loginMode==='member' ? 'bg-violet-500 text-white' : 'text-slate-400 hover:text-white'}`}>{t('Üye girişi','Member sign-in')}</button><button type="button" onClick={()=>{setLoginMode('admin');setError('')}} className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition ${loginMode==='admin' ? 'bg-amber-500/90 text-[#17120a]' : 'text-slate-400 hover:text-white'}`}>{t('Yönetici','Administrator')}</button></div></div><form onSubmit={login} className="mt-7 grid gap-4"><label className="grid gap-2 text-sm font-semibold text-slate-200">{loginMode === 'admin' ? t('Yönetici kullanıcı adı','Administrator username') : t('E-posta veya kullanıcı adı','Email or username')}<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required placeholder={loginMode === 'admin' ? t('Yönetici kullanıcı adın','Administrator username') : t('E-posta adresin veya kullanıcı adın','Your email or username')} className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" /></label><label className="grid gap-2 text-sm font-semibold text-slate-200">{t('Şifre','Password')}<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder={t('Şifren','Your password')} className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20" /></label><label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="h-4 w-4 accent-violet-500" /> {t('Beni hatırla','Remember me')} <span className="text-xs text-slate-500">({t('Bu cihazda hesabımı hatırla','Remember my account on this device')})</span></label>{loginMode === "member" && rememberedAccount && <button type="button" onClick={() => { setUsername(rememberedAccount); setPassword(""); setError(""); }} className="flex w-full items-center gap-3 rounded-xl border border-violet-300/25 bg-violet-400/10 p-3 text-left transition hover:border-violet-300/50 hover:bg-violet-400/15"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/25 text-lg">👤</span><span className="min-w-0 flex-1"><span className="block text-xs text-slate-400">{t('Bu cihazda hatırlanan hesap','Account remembered on this device')}</span><span className="block truncate text-sm font-semibold text-white">@{rememberedAccount}</span></span><span className="text-xs font-semibold text-violet-200">{t('Hesabı seç →','Choose account →')}</span></button>}<ErrorText error={error} /><button disabled={busy} className="mt-2 h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 font-bold text-white shadow-lg shadow-violet-950/40 transition hover:brightness-110 disabled:opacity-50">{busy ? t('Giriş yapılıyor…','Signing in…') : t('Güvenli giriş yap →','Sign in securely →')}</button></form><div className="mt-5 flex flex-wrap justify-center gap-4 text-xs">{loginMode === 'member' && <button type="button" onClick={() => {setView('register');setError('');setNotice('')}} className="text-violet-300 hover:text-white">{t('Yeni hesap oluştur','Create an account')}</button>}<button type="button" onClick={() => {setView('forgot');setError('');setNotice('')}} className="text-slate-400 hover:text-white">{t('Şifremi unuttum','Forgot password?')}</button></div><button onClick={() => { setView('home'); setError('') }} className="mt-6 w-full text-sm text-slate-400 transition hover:text-white">{t('← Ana sayfaya dön','← Back to home')}</button></section>
    </div>
  </main>


  if (view === 'register') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#111526]/95 p-7 text-center sm:p-9"><Brand/><div className="mt-8 text-4xl">✨</div><h1 className="mt-4 text-2xl font-black">Yakında sizinleyiz!</h1><p className="mt-3 text-sm leading-7 text-slate-300">Yeni üye kayıtlarımız şu anda geçici olarak durdurulmuştur. Mehmet IPA'ya gösterdiğiniz ilgi için teşekkür ederiz. Yeniden açıldığında burada olacağız.</p><button type="button" onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-7 h-12 w-full rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold">Mevcut hesabımla giriş yap</button><button type="button" onClick={()=>setView('home')} className="mt-4 text-sm text-slate-400 hover:text-white">Ana sayfaya dön</button></section></main>

  if (view === 'forgot') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 sm:p-9"><Brand/><h1 className="mt-8 text-3xl font-black">Şifremi unuttum</h1><p className="mt-2 text-sm leading-6 text-slate-400">Hesabına bağlı e-posta adresini gir. Sıfırlama bağlantısı göndereceğiz.</p><form onSubmit={requestPasswordReset} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold">E-posta<input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} required autoComplete="email" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><ErrorText error={error}/><NoticeText notice={notice}/><button disabled={busy} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">{busy?'Gönderiliyor…':'Sıfırlama bağlantısı gönder'}</button></form><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400">← Girişe dön</button></section></main>

  if (view === 'reset') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-6 sm:p-9"><Brand/><h1 className="mt-8 text-3xl font-black">Yeni şifre belirle</h1><form onSubmit={resetPassword} className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold">Yeni şifre<input type="password" value={resetPasswordValue} onChange={e=>setResetPasswordValue(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><label className="grid gap-2 text-sm font-semibold">Yeni şifre tekrar<input type="password" value={resetPasswordAgain} onChange={e=>setResetPasswordAgain(e.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><ErrorText error={error}/><NoticeText notice={notice}/><button disabled={busy||!resetToken} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">Şifremi yenile</button></form><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400">Girişe dön</button></section></main>

  if (view === 'verify') return <main className="auth-screen-enter flex min-h-screen items-center justify-center bg-[#080B18] px-4 py-10 text-white"><section className="w-full max-w-md rounded-[2rem] border border-white/10 bg-white/[0.045] p-8"><Brand/><div className="mt-8 text-4xl">✉️</div><h1 className="mt-4 text-2xl font-black">E-posta adresini doğrula</h1><p className="mt-3 text-sm leading-6 text-slate-300">Mehmet IPA doğrulama bağlantısını e-posta adresine gönderdik. Gelen kutunu ve spam klasörünü kontrol et. Bağlantıya tıkladığında hesabın otomatik olarak etkinleşecek. Bu sayfayı yenilesen bile kayıt adımın korunur.</p><div className="mt-6 grid gap-4"><label className="grid gap-2 text-sm font-semibold">E-posta<input type="email" value={verifyEmailInput} onChange={e=>setVerifyEmailInput(e.target.value)} required autoComplete="email" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><label className="grid gap-2 text-sm font-semibold">Kayıt şifren<input type="password" value={verifyPasswordInput} onChange={e=>setVerifyPasswordInput(e.target.value)} required autoComplete="current-password" className="h-12 rounded-xl border border-white/10 bg-black/20 px-4 text-white"/></label><ErrorText error={error}/><NoticeText notice={notice}/><button type="button" disabled={busy||!verifyEmailInput||!verifyPasswordInput} onClick={resendFirebaseVerification} className="h-12 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 font-bold disabled:opacity-50">{busy?'Gönderiliyor…':'Doğrulama e-postasını yeniden gönder →'}</button></div><button onClick={()=>{setView('login');setError('');setNotice('')}} className="mt-5 w-full text-sm text-slate-400">Giriş ekranına dön</button></section></main>

  if (view === 'admin' && user?.role === 'admin') return <Frame><header className="flex flex-wrap items-center justify-between gap-3"><Brand /><div className="flex flex-wrap items-center gap-2"><div id="language-picker-slot" className="shrink-0" /><button type="button" onClick={() => void runRefresh('admin-panel', 'Yönetim paneli', () => loadAdmin(token))} disabled={!!refreshing['admin-panel']} className="rounded-xl border px-3 py-2 text-sm transition disabled:cursor-wait disabled:opacity-60">{refreshing['admin-panel'] ? 'Yenileniyor…' : 'Yenile'}</button><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></div></header><div className="mt-8"><h1 className="text-2xl font-bold">Yönetim paneli</h1><p className="mt-1 text-sm text-muted-foreground">Üye hesapları ve cihaz onayları</p><ErrorText error={error} /><NoticeText notice={notice} />{refreshFeedback['admin-panel'] && <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">{refreshFeedback['admin-panel']}</p>}</div>
<nav aria-label="Yönetim bölümleri" className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
  {([{id:'overview',label:'Genel Bakış',icon:'▦'},{id:'members',label:'Üyeler & VIP',icon:'♙'},{id:'devices',label:'Cihazlar & Apple',icon:'▣'},{id:'system',label:'Sistem & Sertifika',icon:'⚙'}] as const).map(tab => <button key={tab.id} type="button" onClick={() => setAdminTab(tab.id)} aria-pressed={adminTab===tab.id} className={`min-h-12 rounded-xl border px-3 py-3 text-sm font-semibold transition ${adminTab===tab.id?'border-violet-500 bg-violet-600 text-white shadow-lg shadow-violet-950/20':'border-border bg-card text-muted-foreground hover:border-violet-400/50 hover:text-foreground'}`}><span className="mr-1.5">{tab.icon}</span>{tab.label}</button>)}
</nav>
{adminTab === 'overview' && <div className="mt-2 space-y-0"><section className="mt-6 rounded-2xl border border-violet-500/20 bg-card p-5">
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
</div>}
{adminTab === 'system' && <div className="mt-2 space-y-0"><section className="mt-6 rounded-2xl border bg-card p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">VIP sertifikası</h2>
      <p className="mt-1 text-sm text-muted-foreground">P12 parolası ve özel anahtar eşleşmesi, sertifikanın süresi, Apple WWDR G3 imza zinciri ve provisioning profile CMS imzası kontrol edilir. Dosyalar AES-256-GCM ile şifrelenerek özel R2 kasasında tutulur. Apple OCSP/CRL iptal sorgusu henüz yapılmaz.</p>
    </div>
    {certificate && <button type="button" onClick={deleteCertificate} disabled={busy} className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">Sertifikayı sil</button>}
  </div>
  <div className="mt-3 rounded-xl bg-muted/50 p-3 text-sm">
    {certificate ? <>
      <div><strong>Doğrulama:</strong> {certificate.status === 'active' ? <span className="font-semibold text-emerald-600">✓ Teknik doğrulama geçti · Apple WWDR G3</span> : certificate.status === 'stored' ? <span className="font-semibold text-amber-600">Eski kayıt · Gerçekliği henüz kontrol edilmedi; yeniden yükle</span> : <span>{certificate.status}</span>}</div>
      <div><strong>Apple sertifikası:</strong> {certificate.certificate_name || '—'}</div>
      <div><strong>Profil:</strong> {certificate.profile_name || '—'}</div>
      <div><strong>Gerçek bitiş:</strong> {certificate.expires_at ? new Date(certificate.expires_at).toLocaleString(getAppLocale()) : 'Belirtilmedi'}</div>
    </> : 'Henüz sertifika yüklenmedi.'}
  </div>
  <form onSubmit={uploadCertificate} className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1.5 text-sm font-medium">P12 / PFX dosyası<input type="file" accept=".p12,.pfx,application/x-pkcs12" onChange={e => setP12File(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label>
    <label className="grid gap-1.5 text-sm font-medium">Provisioning profile<input type="file" accept=".mobileprovision" onChange={e => setProfileFile(e.target.files?.[0] || null)} required className="w-full rounded-xl border p-2 text-sm" /></label>
    <Field label="P12 şifresi" type="password" autoComplete="new-password" value={certificatePassword} onChange={e => setCertificatePassword(e.target.value)} required />
    <div className="flex items-end text-xs text-muted-foreground">Sertifika bitiş tarihi P12 dosyasından otomatik okunur.</div>
    <div className="sm:col-span-2"><button disabled={busy || !p12File || !profileFile} className="h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-50">{busy ? 'Kontrol ediliyor…' : 'Sertifikayı doğrula ve güvenli yükle'}</button></div>
  </form>
</section>
</div>}
{adminTab === 'members' && <div className="mt-2 space-y-0"><section className="mt-6 rounded-2xl border border-violet-500/20 bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Tamamlanan VIP satışları</h2><p className="mt-1 text-xs text-muted-foreground">Yalnızca ödemesi doğrulanmış ve VIP süresi etkinleştirilmiş işlemler gösterilir. İptal edilen, bekleyen ve reddedilen denemeler bu paneli kalabalık yapmaz.</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">{adminVipOrders.length} tamamlanan</span></div><div className="mt-4 grid gap-2">{adminVipOrders.length===0?<p className="text-sm text-muted-foreground">Henüz tamamlanmış VIP satışı yok.</p>:adminVipOrders.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-xs"><span>{item.name} · @{item.username} · {item.plan_name} · {item.amount_try.toLocaleString('tr-TR')} TL</span><span className="text-emerald-600">VIP etkin</span></div>)}</div></section>
<div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Yeni kullanıcı oluştur</h2><form className="mt-4 grid gap-3" onSubmit={createUser}><Field label="Ad soyad" value={newName} onChange={e => setNewName(e.target.value)} required /><Field label="Kullanıcı adı" value={newUsername} onChange={e => setNewUsername(e.target.value)} autoCapitalize="none" required /><Field label="E-posta" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} required /><Field label="İlk şifre (en az 8 karakter)" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8} /><Field label="Grup" value={newGroup} onChange={e => setNewGroup(e.target.value)} /><button disabled={busy} className="mt-1 h-11 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50">Kullanıcı oluştur</button></form></section><section className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Kullanıcılar</h2><span className="text-sm text-muted-foreground">{users.length} hesap</span></div><div className="mt-4 grid gap-3">{users.length === 0 ? <p className="text-sm text-muted-foreground">Henüz üye yok.</p> : users.map(item => <article key={item.id} className="rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><div className="font-semibold">{item.name}</div><div className="text-sm text-muted-foreground">@{item.username} · {item.group_name || 'Standart'}</div><div className="text-xs text-muted-foreground">{item.email || 'E-posta yok'}</div><div className="mt-2 flex flex-wrap gap-2 text-xs">{item.is_vip ? <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-semibold text-violet-700">{item.vip_plan === 'unlimited' ? '♾️ Sınırsız VIP' : `⭐ VIP · ${item.vip_days_remaining ?? 0} gün kaldı`}</span> : <span className="rounded-full bg-slate-500/10 px-2.5 py-1 text-muted-foreground">Standart üyelik</span>}{item.vip_access_status === 'blocked' && <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-semibold text-red-700">VIP erişimi engelli</span>}{item.vip_expires_at && <span className="text-muted-foreground">Bitiş: {new Date(item.vip_expires_at).toLocaleString(getAppLocale())}</span>}{item.is_vip && item.vip_plan !== 'unlimited' && item.vip_minutes_remaining != null && <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-cyan-700">{item.vip_minutes_remaining >= 1440 ? `${Math.floor(item.vip_minutes_remaining/1440)} gün ${Math.floor((item.vip_minutes_remaining%1440)/60)} sa ${item.vip_minutes_remaining%60} dk kaldı` : item.vip_minutes_remaining >= 60 ? `${Math.floor(item.vip_minutes_remaining/60)} sa ${item.vip_minutes_remaining%60} dk kaldı` : `${item.vip_minutes_remaining} dk kaldı`}</span>}</div></div><span className={`rounded-full px-2.5 py-1 text-xs ${item.status === 'active' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>{item.status === 'active' ? 'Aktif' : 'Engelli'}</span></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => updateUser(item, { status: item.status === 'active' ? 'blocked' : 'active' })} className="rounded-lg border px-3 py-2 text-xs">{item.status === 'active' ? 'Engelle' : 'Engeli kaldır'}</button><button onClick={() => { const isEnglish = window.localStorage.getItem('mehmetipa.language') === 'en'; const group = window.prompt(isEnglish ? 'New group name:' : 'Yeni grup adı:', item.group_name || (isEnglish ? 'Standard' : 'Standart')); if (group !== null) updateUser(item, { group_name: group }) }} className="rounded-lg border px-3 py-2 text-xs">Grubu değiştir</button><button onClick={() => deleteUser(item)} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Sil</button></div><div className="mt-3 flex flex-wrap gap-2 border-t pt-3"><button onClick={() => manageVip(item,'unlimited')} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white">♾️ Sınırsız VIP ver</button><button onClick={() => { const raw=window.prompt('Kaç gün VIP eklensin?','30'); if(raw!==null){const days=Number(raw);if(Number.isInteger(days)&&days>0&&days<=3650) manageVip(item,'extend',days);else setError('1 ile 3650 arasında tam gün gir.')} }} className="rounded-lg border px-3 py-2 text-xs">+ Gün ekle</button><button onClick={() => { if(item.vip_plan==='unlimited') return setError('Sınırsız VIP üyeliğine süre eklenemez.'); const raw=window.prompt('Kaç saat VIP eklensin?','1'); if(raw!==null){const hours=Number(raw);if(Number.isInteger(hours)&&hours>0&&hours<=8760) manageVip(item,'extend_time',hours*60);else setError('1 ile 8760 arasında tam saat gir.')} }} className="rounded-lg border px-3 py-2 text-xs">+ Saat ekle</button><button onClick={() => { if(item.vip_plan==='unlimited') return setError('Sınırsız VIP üyeliğine süre eklenemez.'); const raw=window.prompt('Kaç dakika VIP eklensin?','5'); if(raw!==null){const minutes=Number(raw);if(Number.isInteger(minutes)&&minutes>0&&minutes<=525600) manageVip(item,'extend_time',minutes);else setError('1 ile 525600 arasında tam dakika gir.')} }} className="rounded-lg border px-3 py-2 text-xs">+ Dakika ekle</button>{item.vip_access_status === 'blocked' ? <button onClick={() => manageVip(item,'unblock')} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-700">VIP engelini kaldır</button> : <button onClick={() => manageVip(item,'block')} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-700">VIP erişimini engelle</button>}{item.is_vip && <button onClick={() => manageVip(item,'revoke')} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">VIP'yi kaldır</button>}</div></article>)}</div></section></div></div>}
{adminTab === 'devices' && <div className="mt-2 space-y-0"><section className="mt-6 rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">UDID kayıtları / yönetimi</h2><span className="text-sm text-muted-foreground">{devices.length} cihaz</span></div><p className="mt-2 text-xs text-muted-foreground">Apple Developer hesabıyla güvenli bağlantıyı kontrol et. Bu test yalnızca cihaz listesini okur; Apple hesabına cihaz eklemez veya silmez.</p><div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={testAppleConnection} disabled={appleCheckBusy} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{appleCheckBusy ? '⏳ Apple bağlantısı kontrol ediliyor…' : 'Apple bağlantısını test et'}</button>{appleCheck && <span role="status" className={appleCheck.connected ? 'text-sm text-emerald-600' : 'text-sm text-red-500'}>{appleCheck.connected ? `Bağlantı başarılı · Apple hesabında ${appleCheck.count} cihaz bulundu.` : `Bağlantı başarısız: ${appleCheck.error || 'Apple API yanıt vermedi.'}`}</span>}</div><div className="mt-4 grid gap-3">{devices.length === 0 ? <p className="text-sm text-muted-foreground">Bekleyen cihaz kaydı yok.</p> : devices.map(device => <article key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div className="min-w-0"><div className="font-medium">{device.name || device.username || 'Üye'} · <span className="font-normal text-muted-foreground">{device.udid}</span></div><div className="text-xs text-muted-foreground">Mehmet IPA: {device.status} · Apple: {device.apple_status || 'Bağlantı bekleniyor'} · Profil: {device.profile_status || 'hazırlanıyor'}</div>{device.profile_expires_at && device.profile_status === 'active' && <div className="mt-1 text-xs text-emerald-600">Ad Hoc profili hazır · Bitiş: {new Date(device.profile_expires_at).toLocaleDateString('tr-TR')}</div>}{device.profile_last_error && <div className="mt-1 text-xs text-red-600">Profil hatası: {device.profile_last_error}</div>}{device.apple_last_error && <div className="mt-1 text-xs text-red-600">Apple senkronizasyon hatası: {device.apple_last_error}</div>}</div><div className="flex flex-wrap gap-2"><button onClick={() => updateDevice(device, 'approved')} className="rounded-lg border px-3 py-2 text-xs">Onayla</button><button onClick={() => updateDevice(device, 'pending')} className="rounded-lg border px-3 py-2 text-xs">Beklet</button><button onClick={() => updateDevice(device, 'blocked')} className="rounded-lg border border-red-500/30 px-3 py-2 text-xs text-red-600">Engelle</button><button onClick={() => resetDeviceUdid(device)} className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-700">UDID sıfırla</button></div></article>)}</div></section><section className="mt-5 rounded-2xl border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Apple Developer cihazları</h2><p className="mt-1 text-xs text-muted-foreground">Apple hesabından doğrudan okunan cihazlar. Bu liste salt okunurdur.</p></div><span className="text-sm text-muted-foreground">{appleCheck?.connected ? appleDevices.length : '—'} cihaz</span></div>{!appleCheck ? <p className="mt-4 text-sm text-muted-foreground">Cihazları görmek için önce Apple bağlantısını test et.</p> : appleCheck.connected ? appleDevices.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Apple Developer hesabında kayıtlı cihaz bulunamadı.</p> : <div className="mt-4 grid gap-3">{appleDevices.map(device => <article key={device.id} className="min-w-0 rounded-xl border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{device.name || 'İsimsiz cihaz'}</p><p className="mt-1 text-xs text-muted-foreground">{device.platform || 'Platform belirtilmemiş'} · {device.status || 'Durum belirtilmemiş'}</p></div>{device.added_date && <span className="text-xs text-muted-foreground">Eklenme: {new Date(device.added_date).toLocaleDateString('tr-TR')}</span>}</div><div className="mt-3 rounded-lg bg-muted/50 p-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">UDID</p><p className="mt-1 break-all font-mono text-xs">{device.udid}</p></div></article>)}</div> : <p className="mt-4 text-sm text-red-500">Apple cihaz listesi alınamadı: {appleCheck.error || 'Bağlantı hatası'}</p>}</section></div>}
</Frame>

  if (view === 'home' && user?.role === 'member') return <Frame><header className="flex items-center justify-between"><Brand /><button onClick={logout} className="rounded-xl border px-3 py-2 text-sm">Çıkış</button></header><section className="mx-auto mt-10 max-w-xl rounded-3xl border bg-card p-6"><h1 className="text-2xl font-bold">Merhaba, {user.name}</h1><p className="mt-2 text-sm text-muted-foreground">Hesabın aktif. Kayıtlı cihazlarını buradan yönetebilirsin.</p><p className="mt-2 text-xs text-muted-foreground">UDID kaydı Safari tarafından otomatik doğrulanmaz; yönetici onayı şu an kayıt takibi içindir.</p><form onSubmit={registerDevice} className="mt-6 grid gap-3"><Field label="Cihaz UDID" value={udid} onChange={e => setUdid(e.target.value)} placeholder="UDID değerini gir" required /><button type="submit" disabled={busy} aria-live="polite" className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground transition disabled:cursor-wait disabled:opacity-60">{busy ? "⏳ Gönderiliyor..." : "Cihazı onaya gönder →"}</button></form><ErrorText error={error} /><NoticeText notice={notice} /><div className="mt-5 grid gap-2">{myDevices.map(d => <div key={d.id} className="flex items-center justify-between rounded-xl border p-3 text-sm"><span className="break-all">{d.udid}</span><span>{d.status === 'approved' ? 'Onaylandı' : d.status === 'blocked' ? 'Engellendi' : 'Bekliyor'}</span></div>)}</div><button onClick={() => setView('signer')} className="mt-6 h-11 w-full rounded-xl bg-primary font-semibold text-primary-foreground">İmzalama ekranını aç</button></section></Frame>

  return <main className="mi-public relative min-h-screen overflow-hidden bg-[#070A16] bg-[radial-gradient(ellipse_at_12%_5%,rgba(124,58,237,.20),transparent_34%),radial-gradient(ellipse_at_90%_30%,rgba(6,182,212,.12),transparent_32%),linear-gradient(180deg,#080b18_0%,#090d1b_48%,#070a14_100%)] px-4 py-5 text-white sm:px-6 sm:py-8"><style>{`.mi-public{--mi-line:rgba(167,139,250,.22)}.mi-public .mi-header{position:sticky;top:10px;z-index:30;border:1px solid var(--mi-line);background:rgba(8,13,29,.9);box-shadow:0 18px 55px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.06);backdrop-filter:blur(22px)}.mi-public .mi-intro{border:1px solid rgba(167,139,250,.32);background:radial-gradient(circle at 88% 8%,rgba(34,211,238,.17),transparent 27%),radial-gradient(circle at 4% 100%,rgba(124,58,237,.25),transparent 40%),linear-gradient(125deg,#17112f 0%,#111b39 58%,#092638 100%);box-shadow:0 28px 80px rgba(0,0,0,.38),inset 0 1px rgba(255,255,255,.09)}.mi-public .mi-intro h2{font-size:clamp(1.8rem,5vw,3.15rem);line-height:1.06;letter-spacing:-.045em;max-width:850px}.mi-public .mi-feature{min-height:145px;border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,rgba(255,255,255,.10),rgba(5,12,29,.48));box-shadow:0 12px 30px rgba(0,0,0,.17),inset 0 1px rgba(255,255,255,.06);transition:transform .22s,border-color .22s,box-shadow .22s}.mi-public .mi-feature:hover{transform:translateY(-5px);border-color:rgba(103,232,249,.55);box-shadow:0 18px 40px rgba(8,145,178,.12)}.mi-public .mi-feature>div:first-child{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,rgba(139,92,246,.28),rgba(34,211,238,.13));font-size:25px}.mi-public .mi-hero{position:relative;padding:clamp(22px,5vw,56px);border:1px solid rgba(255,255,255,.10);border-radius:30px;background:linear-gradient(120deg,rgba(15,23,42,.82),rgba(20,17,48,.58));box-shadow:0 25px 70px rgba(0,0,0,.24)}.mi-public .mi-hero h1{letter-spacing:-.055em}.mi-public .mi-console{border:1px solid rgba(103,232,249,.28);background:linear-gradient(145deg,rgba(20,29,54,.98),rgba(35,20,67,.96));box-shadow:0 30px 85px rgba(0,0,0,.45),0 0 55px rgba(124,58,237,.12)}.mi-public .mi-console>div:nth-child(2){background:linear-gradient(145deg,rgba(124,58,237,.15),rgba(8,145,178,.08));border-style:solid;box-shadow:inset 0 1px rgba(255,255,255,.06)}.mi-public .mi-console button{box-shadow:0 10px 30px rgba(124,58,237,.2)}.mi-public .mi-catalog{border-top:1px solid rgba(167,139,250,.18)}.mi-public .mi-vip{position:relative;border:1px solid rgba(167,139,250,.2);border-radius:28px;background:radial-gradient(circle at 50% 0%,rgba(124,58,237,.15),transparent 50%),rgba(12,17,34,.55);padding:clamp(20px,4vw,36px)}.mi-public .mi-vip article{min-height:250px;border-radius:22px;background:linear-gradient(155deg,rgba(255,255,255,.075),rgba(7,12,27,.8));box-shadow:0 16px 40px rgba(0,0,0,.2)}.mi-public .mi-vip article:nth-child(2){background:linear-gradient(155deg,rgba(124,58,237,.25),rgba(18,20,48,.92));box-shadow:0 20px 55px rgba(91,33,182,.2)}.mi-public footer{border-color:rgba(167,139,250,.16)}@media(max-width:640px){.mi-public{padding-left:12px;padding-right:12px}.mi-public .mi-header{top:6px}.mi-public .mi-feature{min-height:124px;padding:14px}.mi-public .mi-hero{padding:22px 16px;border-radius:24px}.mi-public .mi-vip{padding:18px 14px}}`}</style>
    <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-20 h-80 w-80 rounded-full bg-violet-600/20 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-96 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
    <div className="relative mx-auto w-full max-w-6xl">
      <header className="mi-header flex flex-wrap items-center justify-between gap-4 rounded-[22px] px-4 py-3 sm:px-6">
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
      <section className="mi-intro relative mt-5 overflow-hidden rounded-[28px] p-5 sm:p-9">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[.22em] text-cyan-300"><span data-locale="tr">MEHMET IPA'YI KEŞFET</span><span data-locale="en" hidden>DISCOVER MEHMET IPA</span></p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl"><span data-locale="tr">Oyunlarını keşfet, Mehmet IPA'nın sunduğu sertifikayla IPA'larını imzala.</span><span data-locale="en" hidden>Explore games. Sign your IPAs with a certificate provided by Mehmet IPA.</span></h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            <span data-locale="tr">Mehmet IPA; iOS oyunlarını ve rehberlerini keşfedebileceğin, VIP üyeliğin kapsamında sunulan Mehmet IPA sertifikasıyla IPA dosyalarını tarayıcı üzerinden imzalayabileceğin bir platformdur. Oyun ve rehberleri inceleyebilir, imzalama araçlarını kullanmak için üye girişi yapabilirsin.</span>
            <span data-locale="en" hidden>Mehmet IPA is a platform for discovering iOS games and guides, and signing IPA files in your browser with a certificate provided as part of VIP membership. Browse games and guides freely; sign in to access the signing tools.</span>
          </p>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <button type="button" onClick={() => document.getElementById('member-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Üye girişine git" className="mi-feature min-h-[145px] w-full cursor-pointer rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="text-2xl">🎮</div><h3 className="mt-2 text-sm font-bold text-white">{t('Oyunları keşfet','Explore games')}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{t('Oyunları, bilgileri ve rehberleri incele.','Browse games, details, and guides.')}</p>
          </button>
          <button type="button" onClick={() => document.getElementById('member-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Üye girişine git" className="mi-feature min-h-[145px] w-full cursor-pointer rounded-2xl p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="text-2xl">✍️</div><h3 className="mt-2 text-sm font-bold text-white"><span data-locale="tr">IPA dosyalarını imzala</span><span data-locale="en" hidden>Sign IPA files</span></h3><p className="mt-1 text-xs leading-5 text-slate-400"><span data-locale="tr">VIP üyeliğine dahil Mehmet IPA sertifikasıyla tarayıcı üzerinden imzalama yap.</span><span data-locale="en" hidden>Sign in your browser with the Mehmet IPA certificate included with VIP membership.</span></p>
          </button>
          <button type="button" onClick={() => document.getElementById('member-access')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label="Üye girişine git" className="w-full cursor-pointer rounded-2xl border border-white/10 bg-black/15 p-4 text-left transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
            <div className="text-2xl">📘</div><h3 className="mt-2 text-sm font-bold text-white"><span data-locale="tr">Rehberlerden yararlan</span><span data-locale="en" hidden>Browse guides</span></h3><p className="mt-1 text-xs leading-5 text-slate-400"><span data-locale="tr">Kurulum ve kullanım adımlarını öğren.</span><span data-locale="en" hidden>Learn setup and usage steps.</span></p>
          </button>
        </div>
      </section>
      {isInstalledApp && availableUpdate && <section className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-4">
        <div><div className="font-semibold text-cyan-100">Yeni sürüm mevcut · v{availableUpdate.version}</div><p className="mt-1 text-sm text-slate-300">{availableUpdate.notes || 'Mehmet IPA’nın yeni sürümü hazır.'}</p></div>
        <a href={availableUpdate.ipaUrl} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">IPA’yı Güncelle</a>
      </section>}

      <section className="mi-hero mt-8 grid items-center gap-10 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/10 px-3 py-1.5 text-xs font-medium text-violet-200"><span className="h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_12px_#a78bfa]" /> {t('Kolay IPA imzalama','IPA signing made simple')}</div>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl"><span data-locale="tr">iOS uygulamalarını <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">özgürce</span> imzala.</span><span data-locale="en" hidden>Sign iOS apps <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">freely</span>.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">IPA dosyalarını tarayıcı üzerinden imzala. Hesabına giriş yap, VIP üyeliğine dahil Mehmet IPA sertifikasıyla işlemini kolayca başlat.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            {!isInstalledApp && <a href={APP_DOWNLOAD} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/10">↓ Mehmet IPA uygulamasını indir</a>}
            <button onClick={() => { setLoginMode('member'); setView('login'); setError('') }} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 text-sm font-bold text-white shadow-xl shadow-violet-950/40 transition hover:scale-[1.02]"><span data-locale="tr">Hesabıma giriş yap</span><span data-locale="en" hidden>Sign in to my account</span> <span>→</span></button>
          </div>
          <a href="https://t.me/ajandare" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-sky-400/30 bg-sky-400/10 px-5 text-sm font-semibold text-sky-200 transition hover:border-sky-300/60 hover:bg-sky-400/20 sm:w-auto">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="M21.7 4.35a1.2 1.2 0 0 0-1.25-.18L2.9 10.9c-.9.35-.88 1.62.04 1.93l4.5 1.45 1.7 5.1c.3.88 1.43 1.08 2.02.36l2.55-3.1 4.42 3.25c.72.53 1.75.14 1.94-.74l2.7-13.5a1.2 1.2 0 0 0-.07-.9ZM9.1 13.65l8.8-5.55-6.9 7.05-.28 2.72-1.62-4.22Z"/></svg>
            Telegram'dan bize ulaş · @ajandare
          </a>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400"><span>✓ Tarayıcı üzerinden</span><span>✓ Mobil uyumlu</span><span>✓ Güvenli sertifika kasası</span></div>
        </div>
        <div className="mi-console relative mx-auto w-full max-w-md rounded-[30px] p-2">
          <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-violet-500/20 via-indigo-500/10 to-cyan-400/20 blur-2xl" />
          <div className="relative rounded-[26px] border border-white/10 bg-gradient-to-br from-white/[0.09] to-white/[0.025] p-5 backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-slate-200"><span data-locale="tr">İmza merkezi</span><span data-locale="en" hidden>Signing center</span></div><span className="rounded-full bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold text-cyan-200">MEHMET IPA</span></div>
            <div className="mt-7 rounded-2xl border border-dashed border-violet-300/30 bg-violet-400/[0.07] px-5 py-9 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-2xl shadow-lg shadow-violet-950/50">↑</div>
              <div className="mt-5 text-lg font-bold"><span data-locale="tr">IPA dosyan hazır mı?</span><span data-locale="en" hidden>Is your IPA file ready?</span></div>
              <p className="mt-2 text-sm leading-6 text-slate-400"><span data-locale="tr">Hesabına giriş yaparak imzalama ekranına geçebilirsin.</span><span data-locale="en" hidden>Sign in to open the signing screen.</span></p>
              <button onClick={() => { setView('login'); setError('') }} className="mt-5 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-violet-100"><span data-locale="tr">Başlamak için giriş yap</span><span data-locale="en" hidden>Sign in to get started</span></button>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">📱</div><div className="mt-1 text-[11px] text-slate-400">iOS</div></div>
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">🔐</div><div className="mt-1 text-[11px] text-slate-400">Sertifika</div></div>
              <div className="rounded-xl bg-black/20 p-3"><div className="text-lg">⚡</div><div className="mt-1 text-[11px] text-slate-400"><span data-locale="tr">Kolay işlem</span><span data-locale="en" hidden>Easy process</span></div></div>
            </div>
          </div>
        </div>
      </section>

      <section className="mi-catalog py-12 sm:py-16">
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
      <section id="member-access" className="mi-vip scroll-mt-6 my-8 overflow-hidden rounded-[28px] border border-violet-300/20 bg-[radial-gradient(circle_at_90%_5%,rgba(34,211,238,.10),transparent_32%),linear-gradient(125deg,rgba(91,33,182,.20),rgba(30,41,92,.18)_55%,rgba(8,145,178,.10))] p-6 text-center shadow-[0_25px_70px_rgba(0,0,0,.18)] sm:p-9">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300"><span data-locale="tr">MEHMET IPA ÜYELİĞİ</span><span data-locale="en" hidden>MEHMET IPA MEMBERSHIP</span></p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-white sm:text-3xl"><span data-locale="tr">Üyelik alanına hoş geldin</span><span data-locale="en" hidden>Welcome to the member area</span></h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-300"><span data-locale="tr">Mevcut hesabınla giriş yapabilir veya e-posta adresini doğrulayarak hemen yeni hesap oluşturabilirsin.</span><span data-locale="en" hidden>Sign in to your account or create a new one instantly by verifying your email address.</span></p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={() => { setLoginMode('member'); setView('login'); setError('') }} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-violet-950/30 transition hover:scale-[1.02] sm:w-auto"><span data-locale="tr">Üye girişi yap</span><span data-locale="en" hidden>Member sign in</span><span aria-hidden="true">→</span></button>
          <button type="button" onClick={() => { setView('register'); setError(''); setNotice('') }} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-violet-300/30 bg-violet-400/10 px-6 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-400/20 sm:w-auto"><span data-locale="tr">Ücretsiz kayıt ol</span><span data-locale="en" hidden>Create free account</span></button>
        </div>
      </section>
      <footer className="flex flex-col items-center gap-3 border-t border-white/10 py-6 text-xs text-slate-500">
        <div className="flex items-center gap-2"><img src="/icon-dark-512.PNG" alt="" className="h-6 w-6 rounded-md" /> © Mehmet IPA</div>
        <div>iOS IPA Signing Platform</div>
        <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <a className="hover:text-white" href="/legal/">Terms of Service</a>
          <a className="hover:text-white" href="/privacy/">Privacy Policy</a>
          <a className="hover:text-white" href="/refund/">Refund Policy</a>
        </nav>
      </footer>
    </div>
  </main>
}

function ErrorText({ error }: { error: string }) { return error ? <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</p> : null }
function NoticeText({ notice }: { notice: string }) { return notice ? <p role="status" className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">{notice}</p> : null }
