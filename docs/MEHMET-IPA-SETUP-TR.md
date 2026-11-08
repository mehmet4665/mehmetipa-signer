# Mehmet IPA hesap sistemi — kurulum

Bu sürüm mevcut IPA imzalama motorunu korur ve aynı Cloudflare Pages projesine bir Pages Function API ekler.

## Cloudflare Pages ayarları

1. GitHub deposuna bu ZIP içindeki dosyaları yükleyip `master` dalına gönderin. Pages projesinin mevcut build ayarlarını değiştirmeyin (`npm run build`, çıktı klasörü `dist`).
2. Cloudflare → Workers & Pages → `mehmetipa-signer` Pages projesi → Settings → Functions → D1 database bindings bölümünde `DB` adında binding ekleyin ve mevcut `mehmetipa-db` veritabanını seçin.
3. Pages projesi → Settings → Variables and Secrets bölümünde Production için şu iki secret'ı tanımlayın:
   - `ADMIN_USERNAME`: yönetici kullanıcı adı
   - `ADMIN_PASSWORD`: yeni ve güçlü yönetici şifresi (tercihen en az 24 karakter)
   - `RESEND_API_KEY`: Resend hesabından alınan API anahtarı (üyelik doğrulama ve parola e-postaları için)
   - `MAIL_FROM`: Resend üzerinde doğrulanmış gönderici, ör. `Mehmet IPA <hesap@alanadiniz.com>`
   - `ADMIN_NOTIFICATION_EMAIL`: yeni ve doğrulanmış üyelik başvurularının bildirileceği yönetici e-posta adresi
   Önceden sohbet içinde paylaşılan bir şifreyi tekrar kullanma. Worker secret'ları Pages projesine otomatik aktarılmaz; bu değerleri Pages projesinde ayrıca tanımlamalısın.
4. Yeni deployment tamamlanınca `https://mehmetipa-signer.pages.dev/api/health` adresini açın. `success: true` görünmelidir.

## Veritabanı

Mevcut `mehmetipa-db` veritabanına `migrations/0003_self_service_accounts.sql` şeması uygulanmalıdır. Bu migration yeni e-posta, kayıt başvurusu, parola sıfırlama ve hız sınırı tablolarını ekler. Bu migration üretim D1 veritabanına 8 Kasım 2026 tarihinde uygulanmıştır; tekrar çalıştırmayın.

## Kullanım

- Ziyaretçi yalnızca Mehmet IPA uygulamasının indirme bağlantısını görür; imzalama ekranına erişemez.
- Yönetici giriş bilgileri Pages secret'larından doğrulanır.
- Ziyaretçi kayıt formundan başvuru gönderir; önce e-posta doğrulanır, sonra yönetici başvuruyu kabul veya reddeder.
- Onaylanan hesap otomatik olarak aktif üye olur. Yönetici başvuruları panelde görebilir; doğrulanan başvurular `ADMIN_NOTIFICATION_EMAIL` adresine bildirilir.
- Şifre sıfırlama bağlantıları e-posta ile gönderilir ve 30 dakika içinde tek kullanımlık olarak çalışır.
- Giriş, kayıt ve şifre sıfırlama denemeleri IP tabanlı hız sınırına tabidir. Yönetici hesabı herkese açık kayıt formundan oluşturulamaz.
- Yönetici tarafından elle üye oluştururken e-posta adresi de girilmelidir.
- Üye hesabı aktifse giriş yapıp mevcut yerel imzalama ekranına erişir.
- Üye şifresi PBKDF2-SHA-256 ile salt'lı olarak saklanır; düz metin saklanmaz. E-posta doğrulama ve parola sıfırlama token'ları veritabanında yalnızca SHA-256 özetiyle saklanır.
- Oturum belirteci tarayıcı oturum deposunda tutulur ve 7 gün geçerlidir.

## Önemli sınırlar

- Mevcut zsign/WASM motoru tarayıcıda yerel imzalama yapar. Bu sürüm P12 dosyasını sunucuya taşımaz; üye kendi imzalama sertifikasını tarayıcıda seçer. Sunucu tarafında ortak P12 ile imzalama için ayrı bir imzalama servisi gerekir. Cloudflare Pages Function bu işi tek başına yapmaz.
- UDID, Safari'deki web uygulamasından otomatik ve güvenilir şekilde okunamaz. Bu sürüm üyenin girdiği UDID kaydını yönetici panelinde listeler; onay durumu kayıt yönetimidir, henüz imzalama oturumuna donanım doğrulaması uygulamaz. Gerçek cihaz bağlama için native uygulama tarafında UDID doğrulama entegrasyonu gerekir.
- Bu API aynı Pages alan adından çalışır; eski `mehmetipa-api` Worker'ı bu Pages Function sürümünün API çağrılarında kullanılmaz. Eski Worker'ı silmek gerekmez.
