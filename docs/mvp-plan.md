# MVP Planı

## 1) Amaç & Vizyon
- Projenin temel amacı, kullanıcıların ihtiyaçlarını hızlı ve etkili şekilde karşılayan bir ürün geliştirmektir.
- Vizyonumuz, kullanıcı deneyimini ön planda tutarak, kolay erişilebilir ve sürdürülebilir bir çözüm sunmaktır.
- Hedefimiz, minimum kaynakla maksimum fayda sağlamak ve pazarda rekabetçi bir konuma gelmektir.
- Kullanıcıların günlük hayatlarını kolaylaştıran, basit ama güçlü bir araç yaratmak.
- Geri bildirimlere açık, sürekli geliştirmeye uygun bir yapı kurmak.

## 2) Özellikler

### Temel Özellikler
- Kullanıcı kaydı ve giriş sistemi (e-posta ve sosyal medya entegrasyonu).
- Ana fonksiyonun çalıştığı temel modül (örneğin, yol haritası oluşturma, görev yönetimi vs.).
- Basit ve kullanıcı dostu arayüz.
- Veri kaydetme ve geri çağırma mekanizması.
- Bildirim sistemi (e-posta veya uygulama içi).
- Temel güvenlik önlemleri (şifreleme, yetkilendirme).

### Ekstra Özellikler
- Gelişmiş kullanıcı profili yönetimi.
- Çoklu dil desteği.
- Analitik ve raporlama modülü.
- Entegrasyonlar (üçüncü parti API’lar, harita servisleri vb.).
- Gerçek zamanlı iş birliği ve paylaşım özellikleri.
- Mobil uyumlu tasarım ve uygulama bildirimleri.

## 3) Kullanıcı Akışı
- Kullanıcı siteye/app’e giriş yapar veya kayıt olur.
- Ana sayfada temel fonksiyonları görür ve kullanmaya başlar.
- Görev veya yol haritası oluşturur, düzenler ve kaydeder.
- Bildirimler aracılığıyla güncellemelerden haberdar olur.
- Gelişmiş özelliklere ihtiyaç duyarsa profil ayarlarından erişim sağlar.
- Destek veya yardım almak istediğinde iletişim kanallarını kullanır.

## 4) Teknik Mimarisi

- **Frontend:** Next.js 14 (App Router), Tailwind CSS, React Query, Leaflet / Mapbox
- **Backend:** FastAPI (Python), MCP Bridge (Node.js + Express)
- **Veritabanı:** PostgreSQL
- **AI/LLM:** OpenAI API (text-to-text), opsiyonel THY MCP entegrasyonu
- **Authentication:** JWT + Session (Miles&Smiles entegrasyonu için)
- **Diğer:** GitHub, CI/CD GitHub Actions, dotenv ile config yönetimi, Sentry hata takibi

## 6) Başarı Kriterleri
- MVP’nin belirlenen temel fonksiyonları sorunsuz çalıştırması.
- Kullanıcıların kayıt ve giriş işlemlerini kolayca tamamlayabilmesi.
- Kullanıcı deneyiminin olumlu geri bildirimlerle desteklenmesi.
- Performansın kabul edilebilir seviyede olması (yüklenme süreleri, hata oranları).
- İlk kullanıcı kitlesinden düzenli geri dönüşler alınması.
- Belirlenen zaman çizelgesine uyulması ve kritik hataların minimumda tutulması.
- Ürünün kolay genişletilebilir ve sürdürülebilir bir yapıda olması.
