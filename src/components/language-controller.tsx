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
  "IPA dosyanı kendi sertifikan": "Sign your IPA with your own certificate",

  "Private by design": "Gizlilik önceliğimizdir",
  "Sign iOS IPA files locally in your browser": "iOS IPA dosyalarını tarayıcında yerel olarak imzala",
  "Mehmet IPA Signer runs zsign as WebAssembly inside a dedicated browser worker. Your IPA, certificate, provisioning profile, password, optional dylibs, and signed output remain on this device during signing. Signed files are downloaded directly by your browser; this site does not upload IPA files to its servers or to third-party hosting services.": "Mehmet IPA Signer, zsign'ı tarayıcı içinde WebAssembly olarak çalıştırır. IPA dosyan, sertifikan, provisioning profilin, şifren, isteğe bağlı dylib dosyaların ve imzalanmış çıktın imzalama sırasında bu cihazda kalır. Dosyalar doğrudan tarayıcına indirilir; IPA dosyaların bu sitenin sunucularına veya üçüncü taraf barındırma hizmetlerine yüklenmez.",
  "Accepts .ipa,.zip": "Desteklenen biçimler: .ipa, .zip",
  "Accepts .p12,.pfx": "Desteklenen biçimler: .p12, .pfx",
  "Accepts .mobileprovision,.provisionprofile": "Desteklenen biçimler: .mobileprovision, .provisionprofile",
  "Accepts .dylib": "Desteklenen biçim: .dylib",
  "How do you sign an iOS IPA file online?": "iOS IPA dosyası çevrimiçi nasıl imzalanır?",
  "Frequently asked questions": "Sıkça sorulan sorular",
  "Choose an IPA": "Bir IPA dosyası seç",
  "Add your certificate": "Sertifikanı ekle",
  "Add provisioning": "Provisioning profilini ekle",
  "Review signing options": "İmzalama seçeneklerini kontrol et",
  "Sign and download": "İmzala ve indir"

}
const STORAGE_KEY = 'mehmetipa.language'
type Language = 'tr' | 'en'

function getLanguage(): Language {
  if (typeof window === 'undefined') return 'tr'
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'tr' || saved === 'en') return saved
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

const englishToTurkish: Record<string, string> = {
  "Fully local IPA signing in your browser": "Tarayıcında tamamen yerel IPA imzalama",
  "Mobile compatibility mode": "Mobil uyumluluk modu",
  "Uses upstream zsign's slower native archive path to reduce browser memory duplication. Keep this tab active until signing and download finish.": "Tarayıcı belleği kullanımını azaltmak için zsign'ın daha yavaş arşivleme yöntemi kullanılıyor. İmzalama ve indirme tamamlanana kadar bu sekmeyi açık tut.",
  "IPA file": "IPA dosyası",
  "Select or drop your .ipa": ".ipa dosyanı seç veya buraya bırak",
  "Signing certificate (.p12)": "İmzalama sertifikası (.p12)",
  "Select or drop your .p12": ".p12 sertifikanı seç veya buraya bırak",
  "Provisioning profile": "Provisioning profili",
  "Select or drop .mobileprovision": ".mobileprovision dosyanı seç veya buraya bırak",
  "Dylibs (optional)": "Dylib dosyaları (isteğe bağlı)",
  "Select or drop .dylib files to inject": "Eklenecek .dylib dosyalarını seç veya buraya bırak",
  "Credentials & Options": "Sertifika ve imzalama ayarları",
  "Public enterprise certificates": "Genel kurumsal sertifikalar",
  "Load signed list": "İmzalı listeyi yükle",
  "Refresh signed list": "İmzalı listeyi yenile",
  "Sign IPA": "IPA'yı imzala",
  "Signing...": "İmzalanıyor...",
  "Download": "İndir",
  "Clear": "Temizle",
  "Signing complete": "İmzalama tamamlandı",
  "Signed output": "İmzalanmış dosya",
  "About Mehmet IPA": "Mehmet IPA hakkında",
  "Remove file": "Dosyayı kaldır",
  "Large IPAs can be slow because unzipping, signing, and re-archiving happen locally. Keep this tab open and ensure the device has several times the IPA size available as free memory. Installation hosting uploads the signed IPA only after you confirm.": "Büyük IPA dosyaları yerel olarak açılıp yeniden paketlendiği için işlem uzun sürebilir. Bu sekmeyi açık tut ve cihazında IPA boyutunun birkaç katı kadar boş alan bulunduğundan emin ol. İmzalanan dosya, yalnızca onayından sonra kurulum sunucusuna yüklenir."
}
function translateText(value: string, language: Language) {
  const trimmed = value.trim()
  const normalized = trimmed.replace(/\\s+/g, ' ')
  const translated = language === 'en' ? translations[normalized] : englishToTurkish[normalized]
  return translated ? value.replace(trimmed, translated) : value
}

const originalText = new WeakMap<Text, string>()
const originalAttributes = new WeakMap<Element, Map<string, string>>()

function applyLanguage(root: ParentNode, language: Language) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  for (const node of nodes) {
    if (!originalText.has(node)) originalText.set(node, node.textContent || '')
    const source = originalText.get(node) || ''
    const translated = translateText(source, language)
    if (node.textContent !== translated) node.textContent = translated
  }
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll('*'))] : Array.from((root as Document).querySelectorAll?.('*') || [])
  for (const element of elements) {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr)
      if (value) {
        if (!originalAttributes.has(element)) originalAttributes.set(element, new Map())
        const attrs = originalAttributes.get(element)!
        if (!attrs.has(attr)) attrs.set(attr, value)
        const source = attrs.get(attr) || value
        const translated = translateText(source, language)
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
  return <div className="shrink-0">
    <div className="flex items-center gap-1 rounded-full border border-white/15 bg-[#111322]/95 p-1 shadow-xl shadow-black/30 backdrop-blur-xl">
      <button type="button" onClick={() => setLanguage('tr')} aria-pressed={language === 'tr'} className={`rounded-full px-3 py-2 text-xs font-bold transition ${language === 'tr' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>🇹🇷 TR</button>
      <button type="button" onClick={() => setLanguage('en')} aria-pressed={language === 'en'} className={`rounded-full px-3 py-2 text-xs font-bold transition ${language === 'en' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:bg-white/10'}`}>🇬🇧 EN</button>
    </div>
  </div>
}
