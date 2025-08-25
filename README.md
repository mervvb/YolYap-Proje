**🗺️ YolYap Projesi – Kurulum & Çalıştırma Kılavuzu**
======================================================

**YolYap**, rota planlama, harita tabanlı etkileşim ve yapay zekâ destekli öneriler sunan tam yığın (full-stack) bir uygulamadır. Bu doküman, projeyi kurup çalıştırmanız için eksiksiz bir rehberdir.

**📚 İçindekiler**
------------------

1.  Proje Hakkında
    
2.  Mimari Genel Bakış
    
3.  Gereklilikler
    
4.  *   Depoyu Klonla
        
    *   Frontend (Next.js)
        
    *   Backend (FastAPI)
        
    *   MCP Bridge
        
5.  Çalıştırma Akışı
    
6.  Klasör Yapısı
    
7.  Ortam Değişkenleri
    
8.  Faydalı Komutlar
    
9.  Geliştirme ve Katkı
    
10.  Örnek .gitignore
    

    

**🚀 Proje Hakkında**

*   Frontend (frontend/) → Next.js tabanlı arayüz (Harita, Chat, UI).
    
*   Backend (backend/) → FastAPI tabanlı API (Rota planlama, AI/LLM).
    
*   MCP Bridge (backend/src/) → THY MCP sistemine bağlanan Node.js proxy (SSE).
    

**🏗️ Mimari Genel Bakış**

Kullanıcı → Frontend (Next.js) → Backend (FastAPI) → MCP Bridge (SSE) → MCP sistemi

Backend ayrıca OpenAI API ile konuşur, Frontend Mapbox API ile harita servislerini kullanır.

**🔧 Gereklilikler**
--------------------

*   Node.js 20+ (LTS önerilir)
    
*   Python 3.11 / 3.12 (3.13 uyumsuz olabilir)
    
*   Git, cURL
    
*   Paket yöneticisi: npm, yarn veya pnpm
    
*   Gerekli API anahtarları: Mapbox Public Token, OpenAI API Key
    

**⚙️ Kurulum Adımları**
-----------------------

**1) Depoyu Klonla**

git clone

cd YolYap\-Proje

### **2) Frontend (Next.js)**

cd frontend

npm install

npm run dev  → http://localhost:3000

.env.local dosyası:

NEXT\_PUBLIC\_BACKEND\_URL=http://localhost:8080

NEXT\_PUBLIC\_MAPBOX\_TOKEN=

### **3) Backend (FastAPI)**

cd backend

python -m venv .venv

source .venv/bin/activate  (Windows: .venv\\Scripts\\activate)

pip install -r requirements.txt

uvicorn app.main:app –reload –port 8080  → http://localhost:8080/docs

.env dosyası:

OPENAI\_API\_KEY=

### **4) MCP Bridge**

cd backend/src

npm install

npm run dev

.env dosyası:

MCP\_API\_URL=

MCP\_API\_KEY=

**▶️ Çalıştırma Akışı**
-----------------------

1.  Backend’i başlat → uvicorn app.main:app –reload
    
2.  MCP Bridge’i çalıştır → npm run dev
    
3.  Frontend’i aç → npm run dev
    
4.  Tarayıcı → http://localhost:3000
    

**📂 Klasör Yapısı**
--------------------

YolYap\_Proje/

├── backend/ (FastAPI)

│   ├── api/

│   ├── auth/

│   ├── src/

│   ├── features/

│   ├── types/

│   └── requirements.txt

├── frontend/ (Next.js)

│   ├── app/

│   ├── components/

│   ├── public/

│   ├── hooks/

│   ├── types/

│   ├── utils/

│   └── package.json

├── data/

├── docs/

├── .gitignore

└── README.md

**🌍 Ortam Değişkenleri**
-------------------------

Frontend (.env.local): NEXT\_PUBLIC\_BACKEND\_URL, NEXT\_PUBLIC\_MAPBOX\_TOKEN

Backend (.env): OPENAI\_API\_KEY, DB\_URL

MCP Bridge (.env): MCP\_API\_URL, MCP\_API\_KEY(TOKEN)

**💻 Faydalı Komutlar**
-----------------------

Frontend:

npm install

npm run dev

npm run build

npm start

Backend:

python -m venv .venv

source .venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app –reload –port 8080

MCP Bridge:

cd backend/mcp-bridge

npm install

npm run dev

**🤝 Geliştirme ve Katkı**
--------------------------

1.  Repo’yu fork edin
    
2.  Yeni branch açın (git checkout -b feature/yeni-ozellik)
    
3.  Commit edin
    
4.  Push ve Pull Request açın
    

**📑 Örnek .gitignore**
-----------------------

node\_modules/

.next/

out/

dist/

**pycache**/

_.py\[cod\]_

_.venv/_

_.env_

_.env._

frontend/.env.local

backend/.env

backend/mcp-bridge/.env

.DS\_Store

.idea/

.vscode/

