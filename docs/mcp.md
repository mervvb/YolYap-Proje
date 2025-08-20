# Turkish Airlines MCP Entegrasyon Kılavuzu (YolYap Projesi)

Bu doküman, **Turkish Airlines MCP (Model Context Protocol) Server** ile **YolYap** projesinin entegrasyon adımlarını açıklar. Hedef: LLM asistanının (OpenAI) **MCP araçları** üzerinden THY uçuş bilgisi, rezervasyon ve promosyon verilerine erişebilmesidir.

> Resmî THY MCP SSE URL’si: **https://mcp.turkishtechlab.com/sse**  
> (Inspector veya Claude entegrasyonunda bu adres kullanılır.)

---

## İçindekiler
1. [Kavramsal Özet](#kavramsal-özet)
2. [Önkoşullar](#önkoşullar)
3. [MCP Bridge (Node) – Kurulum & Çalıştırma](#mcp-bridge-node--kurulum--çalıştırma)
4. [Giriş (Miles&Smiles OAuth) Akışı](#giriş-milesandsmiles-oauth-akışı)
5. [LLM (OpenAI) ile Kullanım – Backend Uçları](#llm-openai-ile-kullanım--backend-uçları)
6. [Desteklenen MCP Araçları](#desteklenen-mcp-araçları)
7. [MCP Inspector ile Hızlı Test](#mcp-inspector-ile-hızlı-test)
8. [Claude Entegrasyonu (Opsiyonel)](#claude-entegrasyonu-opsiyonel)
9. [Çevre Değişkenleri](#çevre-değişkenleri)
10. [Güvenlik Notları](#güvenlik-notları)
11. [Sorun Giderme](#sorun-giderme)

---

## Kavramsal Özet
- **MCP (Model Context Protocol)**, LLM’lerin haricî sistemlere **araçlar** (tools) üzerinden güvenli ve standardize şekilde erişmesini sağlar.
- **THY MCP Server**, THY uçuş bilgileri/rezervasyon/üye işlemleri için bir dizi **araç** sunar. Bu araçlar **Miles&Smiles** hesabı ile kimlik doğrulaması gerektirir.
- Projede **mcp-bridge** adlı küçük bir Node servisimiz vardır. Bu servis:
  - Tarayıcıdan **Miles&Smiles login** akışını yönetir.
  - Oturumu cookie dosyasında tutar.
  - Backend (FastAPI) tarafından çağrıldığında **MCP SSE** üzerinden THY araçlarına bağlanır.

---

## Önkoşullar
- Node.js 20+
- Backend (FastAPI) için Python 3.11/3.12
- Miles&Smiles hesabı (login için)
- **OpenAI API Key** (LLM çağrıları için)

---

## MCP Bridge (Node) – Kurulum & Çalıştırma
**Klasör:** `backend/mcp-bridge`

```bash
cd backend/mcp-bridge
npm install
# Çalıştırma (dev):
npm run dev
# veya prod benzeri:
npm run start
```

Çalışınca logda şunu görmelisiniz:
```
mcp-bridge listening on 9090
```

> Varsayılan login endpoint’i: **http://127.0.0.1:9090/thy/login**

---

## Giriş (Miles&Smiles OAuth) Akışı
1. Tarayıcıda **http://127.0.0.1:9090/thy/login** adresini açın.
2. THY giriş ekranına yönlendirilirsiniz. **Miles&Smiles** bilgilerinizle giriş yapın.
3. Giriş sonrası bridge, session/cookie bilgilerini **COOKIE_FILE** içinde saklar.
4. Artık backend, MCP araçlarını kullanabilir.

> Oturum durumu için (ops.): **http://127.0.0.1:9090/thy/status**  
> Oturumu kapatmak için (ops.): **http://127.0.0.1:9090/thy/logout**

---

## LLM (OpenAI) ile Kullanım – Backend Uçları
**Klasör:** `backend/`

Backend’te `POST /ai/ask` endpoint’i üzerinden LLM çağrısı yapılır. MCP kullanmak için body’de `useMcp: true` verilir. Ayrıca bir **tool** ve **params** sağlanabilir.

### Örnek – Uçuş Arama (Search Flights)
```bash
curl -X POST http://127.0.0.1:8080/ai/ask \
  -H "Content-Type: application/json" \
  -d '{
    "message": "İstanbul-Londra uçakları 2025-08-28",
    "useMcp": true,
    "tool": "search-flights",
    "params": {
      "origin": "IST",
      "destination": "LHR",
      "date": "2025-08-28",
      "pax": 1
    }
  }'
```

> Notlar:
> - Parametreler eksikse backend, LLM üzerinden kullanıcıdan **netleştirme** ister (örn. tarih/IATA).
> - `useMcp: false` durumda LLM genel yanıt verir, MCP çağrısı yapılmaz.

---

## Desteklenen MCP Araçları
THY MCP dokümanına göre başlıca araçlar:

### ✈️ Flight Information & Services
- **Search Flights** – Kalkış/varış/tarih/yolcu ile uçuş ara.
- **Get Flight Status by Number** – Uçuş numarası + tarih ile durum.
- **Get Flight Status by Route** – Kalkış/varış + tarih ile durum.
- **Create Flight Booking Link** – Arama sonucundan deeplink üret.

### 📋 Booking & Check-in
- **Get Booking Details** – PNR + soyadı ile rezervasyon bilgisi.
- **Get Check-in Booking Details** – Check-in uygun rezervasyon için.
- **Get Booking Baggage Allowance** – Bagaj hakkı.

### 🌍 Travel & Promotions
- **Get Airline Promotions** – Ülke/havalimanına göre promosyon.
- **Get City Guide** – Şehre özel rehber ve promosyonlar.

### 👤 Member Account
- **Get Current User Details** – Üye profili ve kimlik.
- **Get Member Flights** – Üyenin uçuşları.
- **Get Expiring Miles** – Yakında süresi dolacak miller.
- **Logout** – Oturum kapatma.

> Kaynak URL (SSE): **https://mcp.turkishtechlab.com/sse**  
> (İstemci/inspector bağlantılarında bu adres kullanılır.)

---

## MCP Inspector ile Hızlı Test
**Amaç:** MCP server’a doğrudan bağlanıp araçları gözlemlemek.

1. Inspector’ı başlat:
   ```bash
   npx @modelcontextprotocol/inspector
   ```
2. Tarayıcıda **http://localhost:5173** aç.
3. **Transport Type**: `SSE`
4. **URL**: `https://mcp.turkishtechlab.com/sse`
5. **Connect** → THY login sayfasına yönleneceksiniz. Miles&Smiles ile giriş yapın.
6. Bağlantı sonrası listeden araçları deneyin.

---

## Claude Entegrasyonu (Opsiyonel)
**claude.ai (Pro):**
- Ayarlar → Integrations → **Add integration**
- URL: `https://mcp.turkishtechlab.com/sse`

**Claude Desktop:** `claude_desktop_config.json` içine:  
```json
{
  "mcpServers": {
    "turkish-airlines": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.turkishtechlab.com/mcp"
      ]
    }
  }
}
```
Kaydedin ve uygulamayı yeniden başlatın.

> **Not:** Bu entegrasyonlar doğrudan Claude istemcisiinindir. YolYap projesi, kendi **mcp-bridge** servisini kullanır ve backend üzerinden LLM çağrılarıyla MCP’ye gider.

---

## Çevre Değişkenleri

### `backend/mcp-bridge/.env`
```dotenv
PORT=9090
SESSION_SECRET=some-long-random-secret
MCP_SSE_URL=https://mcp.turkishtechlab.com/sse
COOKIE_FILE=.cookies.json
```

### `backend/.env` (LLM ve proxy)
```dotenv
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxx
BACKEND_BASE_URL=http://127.0.0.1:8080
```

> **Güvenlik:** `.env` dosyalarını repoya koymayın.

---

## Güvenlik Notları
- **Miles&Smiles giriş** sadece **kullanıcı tarayıcısında** yapılır; kimlik bilgileri sunucuda tutulmaz.
- MCP Bridge, oturum bilgisini **COOKIE_FILE** içinde saklar (dosyayı gizli tutun).
- Frontend’te sadece **public Mapbox token** kullanın; gizli anahtarları backend’de tutun.
- CORS’u sadece gerekli origin’lere açın (örn. `http://localhost:3000`).

---

## Sorun Giderme
- **Login olmadan MCP çağrısı** → `401/403` görebilirsiniz. Önce `http://127.0.0.1:9090/thy/login` ile giriş yapın.
- **Bridge çalışmıyor** → `npm run dev` çıktılarını kontrol edin, port 9090 boş mu?
- **LLM “Bu bilgi elimde yok” diyor** → Backend `useMcp: true` ve doğru `tool/params` aldığından emin olun. Parametre eksikse LLM’in netleştirmesi gerekir.
- **CORS hatası** → Backend `.env` içinde `CORS_ALLOW_ORIGINS` değerini doğrulayın.
- **Bağlantı sorunu** → Kurumsal ağlarda SSE engelli olabilir; farklı ağ deneyin.

---

## Yararlı Linkler
- THY MCP SSE: **https://mcp.turkishtechlab.com/sse**
- Türk Hava Yolları Dijital Lab (iletişim): `digitallab@thy.com`
- Model Context Protocol (genel bilgi): https://modelcontextprotocol.io

---

## Hızlı Kontrol Listesi
- [ ] `backend/mcp-bridge` çalışıyor ve 9090’da dinliyor.
- [ ] `http://127.0.0.1:9090/thy/login` ile giriş yapıldı (Miles&Smiles).
- [ ] `backend` çalışıyor (8080) ve `OPENAI_API_KEY` tanımlı.
- [ ] `frontend` çalışıyor (3000) ve `NEXT_PUBLIC_MCP_BRIDGE` doğru.
- [ ] LLM çağrılarında `useMcp: true` ve doğru `tool/params` gönderiliyor.
