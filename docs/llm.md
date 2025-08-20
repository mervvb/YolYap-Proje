
# 👀Rotalist

## LLM (AI Asistan) Kullanımı Dokümantasyonu

## Amaç
Bu doküman, YolYap Projesi kapsamında kullanılan LLM (Large Language Model) tabanlı AI asistanının kullanımını ve entegrasyonunu detaylı şekilde açıklamaktadır. Projenin amacı, kullanıcıların doğal dil ile etkileşim kurarak yol durumu, trafik bilgisi, uçuş verileri ve diğer ilgili bilgiler hakkında hızlı ve doğru bilgi almasını sağlamaktır. AI asistan, metin  tabanlı girdileri işleyerek kullanıcı deneyimini artırmayı hedefler. Asistan, sadece trafik ve rota bilgileriyle sınırlı kalmayıp, aynı zamanda tarihi ve kültürel bilgiler hakkında da cevap verecek şekilde tasarlanmıştır; böylece kullanıcıların merak ettikleri yerleri öğrenmelerine yardımcı olur. Ayrıca, kullanıcı arayüzünde hazır promptlar (kısa hazır sorular/istekler) bulunmakta olup, kullanıcılar bu hazır seçenekleri kolayca seçerek hızlıca bilgi alabilir veya rota oluşturabilirler.

## Mimari
YolYap Projesindeki LLM mimarisi, farklı veri kaynaklarından gelen bilgileri entegre eden ve kullanıcı isteklerine yanıt veren modüler bir yapıya sahiptir. Temel bileşenler şunlardır:

- **Kullanıcı Arayüzü (UI):** Metin girişlerini alır, yanıtları gösterir.
- **LLM Motoru:** OpenAI tabanlı text-to-text modelini kullanarak doğal dil işleme yapar.
- **Harita ve Trafik Entegrasyonu:** Mapbox API'si üzerinden gerçek zamanlı trafik verilerini alır.
- **Uçuş Verisi Entegrasyonu:** Türk Hava Yolları MCP sistemi ile uçuş bilgilerini sorgular.
- **Fonksiyon Çağrıları Modülü:** LLM tarafından tetiklenen fonksiyon çağrıları ile dış sistemlerle etkileşim sağlar.

## Kullanılan Modeller
- **OpenAI Text-to-Text Modeli:** Kullanıcı sorgularını anlamak ve doğal dilde yanıtlar üretmek için kullanılır.
- **Ses Tanıma ve Sentez Modülleri:** Google Speech-to-Text ve Text-to-Speech API’leri veya benzeri teknolojilerle sesli komut ve yanıt desteği sağlanır (Gelişim Aşamasında).
- **Mapbox Trafik Verisi:** Gerçek zamanlı yol ve trafik durumu bilgisi için kullanılır.
- **THY MCP Entegrasyonu:** Uçuş durumları, kalkış-varış bilgileri gibi THY'ye ait veriler LLM tarafından erişilebilir.

## Entegrasyon Yapısı
1. Kullanıcı arayüzünden metin komutu alınır.
3. Metin, OpenAI LLM modeline gönderilir.
4. LLM, gelen sorguyu analiz ederek gerekirse fonksiyon çağrısı yapar.
5. Fonksiyon çağrısı ile Mapbox veya THY MCP API’lerinden ilgili veriler çekilir.
6. Alınan veriler LLM tarafından işlenir ve kullanıcıya uygun yanıt oluşturulur.
7. Yanıt metin olarak kullanıcıya iletilir.

## Fonksiyon Çağrıları (Function Calling)
LLM, kullanıcı sorgusuna bağlı olarak belirli fonksiyonları çağırabilir. Fonksiyon çağrıları JSON formatında yapılır ve aşağıdaki yapıyı takip eder:

### Fonksiyon Çağrısı Örneği:
```json
{
  "name": "get_traffic_info",
  "parameters": {
    "location": "Istanbul",
    "time": "2024-06-01T08:00:00Z"
  }
}
```

### Fonksiyonlar:
- **get_traffic_info:** Belirtilen lokasyon ve zaman için trafik durumu bilgisi döner.
- **get_flight_status:** Uçuş numarası veya tarih bazında uçuş bilgilerini sağlar.
- **convert_speech_to_text:** Sesli komutu metne dönüştürür (Gelişim Aşamasında).
- **convert_text_to_speech:** Metin yanıtını sesli hale getirir (Gelişim Aşamasında).

### Yanıt Formatı:
Fonksiyon çağrısı sonrası LLM, aşağıdaki gibi yapılandırılmış bir yanıt döner:

```json
{
  "response_text": "İstanbul'da saat 08:00'de trafik yoğunluğu %75 seviyesinde olup, ana yollar üzerinde yavaşlamalar yaşanmaktadır.",
  "data": {
    "traffic_level": "high",
    "affected_roads": ["E-5", "TEM Otoyolu"]
  }
}
```

## Örnek Kullanım Senaryoları

### 1. Trafik Bilgisi Sorgulama
**Kullanıcı:** "İstanbul'daki trafik durumu nasıl?"

**Sistem:**
- LLM, `get_traffic_info` fonksiyonunu çağırır.
- Mapbox API’den trafik verisi alınır.
- Kullanıcıya trafik yoğunluğu ve alternatif güzergah önerileri sunulur.

### 2. Uçuş Durumu Sorgulama
**Kullanıcı:** "THY TK123 seferinin kalkış saati nedir?"

**Sistem:**
- LLM, `get_flight_status` fonksiyonunu çağırır.
- THY MCP API’den uçuş bilgisi alınır.
- Kullanıcıya uçuşun kalkış saati ve güncel durumu bildirilir.

### 3. Sesli Komut ile Sorgu (Gelişim Aşamasında)
**Kullanıcı (Sesli):** "Bugün Ankara'ya giden yollar nasıl?"

**Sistem:**
- Ses tanıma modülü komutu metne çevirir.
- LLM ilgili fonksiyonları çağırarak yanıt oluşturur.
- Yanıt ses sentezi ile kullanıcıya sesli olarak iletilir.

## Gelecek Geliştirmeler
- **Çok Dilli Destek:** Türkçe dışındaki diller için destek genişletilecek.
- **Daha Gelişmiş Ses İşleme:** Gürültü engelleme ve doğal ses sentezi iyileştirilecek.
- **Öğrenen Modeller:** Kullanıcı geri bildirimleri ile LLM modelleri sürekli güncellenecek.
- **Gerçek Zamanlı Uyarılar:** Trafik kazaları ve acil durumlar için anlık bildirim sistemi entegre edilecek.
- **Genişletilmiş Fonksiyon Çağrıları:** Yeni veri kaynakları ve hizmetler için fonksiyonlar eklenecek.

---

Bu doküman, YolYap Projesinin LLM kullanımını kapsamlı şekilde açıklamakta ve projeye yeni katılan geliştiriciler için rehber niteliğindedir.
