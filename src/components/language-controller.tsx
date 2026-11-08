import * as React from 'react'

const translations: Record<string, string> = {
  "IPA imzalama": "IPA Signing",
  "IPA dosyanı kendi sertifikan ve provisioning profile dosyanla imzalama ekranına geç.": "Sign your IPA using your own certificate and provisioning profile.",
  "İmzalama merkezini aç →": "Open Signing Center →",
  "Hesabım": "Account",
  "Ayarlar": "Settings",
  "Çıkış": "Log out",
  "Çıkış yap": "Log out",
  "Games": "Games",
  "Hesap durumu: Aktif": "Account status: Active",
  "Cihaz kaydı": "Device registration",
  "Cihaz UDID": "Device UDID",
  "UDID değerini gir": "Enter your UDID",
  "Cihazı onaya gönder": "Submit device for approval",
  "Onaylandı": "Approved",
  "Engellendi": "Blocked",
  "Bekliyor": "Pending",
  "Hesap ve destek işlemleri": "Account and support",
  "Telegram destek": "Telegram support",
  "Dosyalarını ekle": "Add your files",
  "Sertifika ve imzalama ayarları": "Certificate & signing settings",
  "Uygulamanı özgürce imzala.": "Sign your apps with freedom.",
  "IPA dosyası": "IPA file",
  "Sertifika": "Certificate",
  "İmzala": "Sign",
  "PRIVATE SIGNING WORKSPACE": "PRIVATE SIGNING WORKSPACE",
  "MEHMET IPA / SIGNING STUDIO": "MEHMET IPA / SIGNING STUDIO",
  "IPA file": "IPA file",
  "Signing certificate (.p12)": "Signing certificate (.p12)",
  "Provisioning profile": "Provisioning profile",
  "Dylibs (optional)": "Dylibs (optional)",
  "Select or drop your .ipa": "Select or drop your .ipa",
  "Select or drop your .p12": "Select or drop your .p12",
  "Select or drop .mobileprovision": "Select or drop .mobileprovision",
  "Select or drop .dylib files to inject": "Select or drop .dylib files to inject",
  "Inputs": "Files",
  "Credentials & Options": "Credentials & Options",
  "Mobile compatibility mode": "Mobile compatibility mode",
  "Uses upstream zsign's slower native archive path to reduce browser memory duplication. Keep this tab active until signing and download finish.": "Uses zsign's slower native archive method to reduce browser memory usage. Keep this tab open until signing and download are complete.",
  "Fully local IPA signing in your browser": "Sign IPA files locally in your browser",
  "Sign iOS IPA files locally in your browser": "Sign iOS IPA files locally in your browser",
  "IPA dosyanı": "Your IPA file",
  "Yükleniyor...": "Loading...",
  "Üyeler": "Members",
  "Cihazlar": "Devices",
  "Yönetici Paneli": "Admin Panel",
  "Yeni Üye Oluştur": "Create new member",
  "Ad soyad": "Full name",
  "Kullanıcı adı": "Username",
  "Şifre": "Password",
  "Üye Oluştur": "Create member",
  "Üye Listesi": "Member list",
  "Engeli Kaldır": "Unblock",
  "Engelle": "Block",
  "Cihaz Onayları": "Device approvals",
  "Onayla": "Approve",
  "Reddet": "Reject",
  "Yenile": "Refresh",
  "İsim, kullanıcı adı ve şifre gerekli.": "Name, username and password are required.",
  "Üye oluşturuldu.": "Member created.",
  "Üyeler alınamadı.": "Could not load members.",
  "Sunucu bağlantı hatası.": "Server connection error.",
  "İşlem başarısız.": "Operation failed.",
  "IPA dosyanı kendi sertifikan": "Sign your IPA with your own certificate"
}
const STORAGE_KEY = 'mehmetipa.language'
type Language = 'tr' | 'en'

function getLanguage(): Language {
  if (typeof window === 'undefined') return 'tr'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'tr' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function translateText(value: string, language: Language) {
  if (language === 'tr') return value
  const trimmed = value.trim()
  const translated = translations[trimmed]
  if (translated) return value.replace(trimmed, translated)
  return value
}

function applyLanguage(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    const original = node.textContent || ''
    const translated = translateText(original, language)
    if (translated !== original) node.textContent = translated
  }
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from((root as Document).querySelectorAll?.('*') || [])
  for (const element of elements) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr)
      if (value) {
        const translated = translateText(value, language)
        if (translated !== value) element.setAttribute(attr, translated)
      }
    }
  }
}

export function LanguageController() {
  const [language, setLanguage] = React.useState<Language>(getLanguage)
  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language)
    document.documentElement.lang = language
    applyLanguage(document.body, language)
    const observer = new MutationObserver(() => applyLanguage(document.body, language))
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder','title','aria-label'] })
    return () => observer.disconnect()
  }, [language])
  return <div className="fixed right-3 top-[max(env(safe-area-inset-top),12px)] z-[9999]">
    <div className="flex items-center gap-1 rounded-full border border-white/15 bg-[#111322]/95 p-1 shadow-xl shadow-black/30 backdrop-blur-xl">
      <button type="button" onClick={() => setLanguage('tr')} aria-pressed={language === 'tr'} className={`rounded-full px-3 py-2 text-xs font-bold transition ${language === 'tr' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>🇹🇷 TR</button>
      <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className={`rounded-full px-3 py-2 text-xs font-bold transition ${language === 'en' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>🇬🇧 EN</button>
    </div>
  </div>
}
