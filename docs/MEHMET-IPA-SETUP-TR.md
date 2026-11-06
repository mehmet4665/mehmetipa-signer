# Mehmet IPA hesap sistemi — kurulum

Bu sürüm mevcut IPA imzalama motorunu korur ve aynı Cloudflare Pages projesine bir Pages Function API ekler.

## Cloudflare Pages ayarları

1. GitHub deposuna bu ZIP içindeki dosyaları yükleyip `master` dalına gönderin. Pages projesinin mevcut build ayarlarını değiştirmeyin (`npm run build`, çıktı klasörü `dist`).
2. Cloudflare → Workers & Pages → `mehmetipa-signer` Pages projesi → Settings → Functions → D1 database bindings bölümünde `DB` adında binding ekleyin ve mevcut `mehmetipa-db` veritabanını seçin.
3. Pages projesi → Settings → Variables and Secrets bölümünde Production için şu iki secret'ı tanımlayın:
   - `ADMIN_USERNAME`: yönetici kullanıcı adı
   - `ADMIN_PASSWORD`: yeni ve güçlü yönetici şifresi (tercihen en az 24 karakter)
   Önceden sohbet içinde paylaşılan bir şifreyi tekrar kullanma. Worker secret'ları Pages projesine otomatik aktarılmaz; bu değerleri Pages projesinde ayrıca tanımlamalısın.
4. Yeni deployment tamamlanınca `https://mehmetipa-signer.pages.dev/api/health` adresini açın. `success: true` görünmelidir.

## Veritabanı

Daha önce oluşturulmuş `users` ve `devices` tabloları bu API tarafından kullanılır. Tablolar henüz yoksa `migrations/0001_mehmetipa.sql` dosyasını D1 Console'da bir kez çalıştırın. Tablolar zaten varsa migration'ı tekrar çalıştırmanız gerekmez.

## Kullanım

- Ziyaretçi yalnızca Mehmet IPA uygulamasının indirme bağlantısını görür; imzalama ekranına erişemez.
- Yönetici giriş bilgileri Pages secret'larından doğrulanır.
- Yönetici panelinden üyeler açılır. Üye kaydı herkese açık değildir.
- Üye hesabı aktifse giriş yapıp mevcut yerel imzalama ekranına erişir.
- Üye şifresi PBKDF2-SHA-256 ile salt'lı olarak saklanır; düz metin saklanmaz.
- Oturum belirteci tarayıcı oturum deposunda tutulur ve 7 gün geçerlidir.

## Önemli sınırlar

- Mevcut zsign/WASM motoru tarayıcıda yerel imzalama yapar. Bu sürüm P12 dosyasını sunucuya taşımaz; üye kendi imzalama sertifikasını tarayıcıda seçer. Sunucu tarafında ortak P12 ile imzalama için ayrı bir imzalama servisi gerekir. Cloudflare Pages Function bu işi tek başına yapmaz.
- UDID, Safari'deki web uygulamasından otomatik ve güvenilir şekilde okunamaz. Bu sürüm üyenin girdiği UDID kaydını yönetici panelinde listeler; onay durumu kayıt yönetimidir, henüz imzalama oturumuna donanım doğrulaması uygulamaz. Gerçek cihaz bağlama için native uygulama tarafında UDID doğrulama entegrasyonu gerekir.
- Bu API aynı Pages alan adından çalışır; eski `mehmetipa-api` Worker'ı bu Pages Function sürümünün API çağrılarında kullanılmaz. Eski Worker'ı silmek gerekmez.
