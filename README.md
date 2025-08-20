# YolYap_Proje – Kurulum & Çalıştırma Kılavuzu

Bu proje 3 ana parçadan oluşur:

- **frontend/** → Next.js (Harita + UI + Chat)  
- **backend/** → FastAPI (Rota planlama, AI/LLM, MCP proxy)  
- **backend/mcp-bridge/** → THY MCP Bridge (SSE ile MCP’ye bağlanır, login akışını yönetir)

> Tavsiye edilen sürümler: **Node 20+**, **Python 3.11/3.12**, **npm** (veya pnpm/yarn), **Mapbox public token**, **OpenAI API key**.

---

## 1) Gereklilikler

- Node.js 20+ (LTS önerilir)  
- Python 3.11/3.12 (3.13 uyumsuzluk çıkarabilir)  
- Git, cURL  
- VS Code (önerilen IDE)

---

## 2) Depoyu Klonla

```bash
git clone <SENIN_REPO_URLUN>
cd YolYap_Proje
