# Proje Fikri

Bu proje, kullanıcıların harita üzerinde kolayca rota planlamalarını sağlayan, trafik bilgisi ve kullanıcı tercihleri doğrultusunda öneriler sunan bir uygulamadır. Ayrıca yapay zeka destekli asistan entegrasyonu ile daha akıllı ve kişiselleştirilmiş deneyimler sunmayı hedeflemektedir.

# Ana Özellikler

- Harita tabanlı rota planlama
- Gerçek zamanlı trafik bilgisi entegrasyonu
- Kullanıcı tercihine göre kişiselleştirilmiş rota ve aktivite önerileri
- Yapay zeka asistan entegrasyonu ile kullanıcıya destek ve rehberlik

# Teknik Yapı

- **Frontend:** Next.js, Leaflet, Mapbox
- **Backend:** FastAPI, Python, OpenAI API, MCP Bridge
- **Veritabanı:** PostgreSQL

# Kullanım Senaryosu

Kullanıcı İstanbul’da 3 saatlik bir tur yapmak istediğinde, uygulama öncelikle mevcut trafik durumunu analiz eder ve kullanıcının tercihleri doğrultusunda (örneğin kültürel mekanlar, kafeler) uygun noktaları seçer. Ardından yapay zeka destekli asistan, en verimli ve keyifli rotayı oluşturur ve kullanıcıya sunar. Kullanıcı bu rota üzerinden rahatlıkla turunu gerçekleştirebilir.

# Gelecek Geliştirmeler

- Kişiselleştirilmiş öneri algoritmalarının geliştirilmesi
- Ulaşım desteği: toplu taşıma (otobüs/metro/tramvay) bilgileri ve entegrasyonu, yürüme/bisiklet/araç modları, aktarma sayısı ve tahmini maliyet/varış süresi optimizasyonu
- Ziyaret edilecek yerleri özelliklerine göre filtreleme: kategori (tarihî/müze/park/kafe vb.), açık/kapalı saatler, giriş ücreti, erişilebilirlik, kalabalıklık tahmini, çocuk dostu, açık/kapalı alan
