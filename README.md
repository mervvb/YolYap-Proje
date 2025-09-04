**🗺️ YolYap Project **
======================================================

<img width="1215" height="837" alt="Ekran Resmi 2025-08-21 21 59 19" src="https://github.com/user-attachments/assets/586e79ca-a28f-452a-8d1e-a2657ac3d8ba" />




<img width="1214" height="835" alt="KAYIT" src="https://github.com/user-attachments/assets/03a5b014-2968-41fe-b21c-02ed3aaaff95" />




<img width="1213" height="838" alt="GİRİŞ" src="https://github.com/user-attachments/assets/756a2dd0-b6c3-4ec1-b807-8a222bc67dd4" />




<img width="1220" height="839" alt="HOME" src="https://github.com/user-attachments/assets/647d65ca-ef39-4ee8-88dc-99c0dd2f8b4a" />




<img width="1019" height="614" alt="ROTA1" src="https://github.com/user-attachments/assets/10ff639d-3057-4cdf-b4cf-df6c8d5faf48" />




<img width="1040" height="611" alt="ROTA2" src="https://github.com/user-attachments/assets/03d1e3a6-2587-4bb8-93a6-42db76d904e4" />




<img width="318" height="131" alt="SAAT1" src="https://github.com/user-attachments/assets/162c6e3c-3dc8-4541-a4d7-c62bee2d61a3" />




<img width="317" height="109" alt="KAYDIRICI" src="https://github.com/user-attachments/assets/43ce545c-48b8-4f09-b497-09dbe2128fd1" />




<img width="308" height="105" alt="SAAT2" src="https://github.com/user-attachments/assets/1fa50b31-4b28-47f2-844f-e741426287c6" />




<img width="1076" height="426" alt="ROTALAR" src="https://github.com/user-attachments/assets/23aadfb7-244f-4171-852a-e4cc0447af40" />




<img width="1069" height="545" alt="Herkes için kullanım" src="https://github.com/user-attachments/assets/90756c73-9f29-42e3-a382-c67e9d343f8a" />




<img width="641" height="672" alt="ÇARK" src="https://github.com/user-attachments/assets/5752147e-1574-4d72-a014-1b13f6a7e002" />




<img width="688" height="697" alt="ÖNERİ" src="https://github.com/user-attachments/assets/8e8eaa2e-49a0-4f7f-bf5d-5de5b154be34" />




<img width="677" height="637" alt="asistan" src="https://github.com/user-attachments/assets/fdf8ff50-1ffb-41f4-88ef-d2b29957286c" />




<img width="670" height="635" alt="mcp1" src="https://github.com/user-attachments/assets/76c14c91-f7df-4bf3-b6e1-3c8fcf92f4f0" />




<img width="665" height="281" alt="mcp2" src="https://github.com/user-attachments/assets/57b1ad7e-394e-4ae3-bad1-4c086cecaea2" />




<img width="670" height="635" alt="mcp3" src="https://github.com/user-attachments/assets/62905343-1dd6-42d0-ab33-6cd804a202f3" />




<img width="1215" height="592" alt="PROFİL1" src="https://github.com/user-attachments/assets/2796ffc2-d7e9-4507-8baf-84c1eb789387" />




<img width="1214" height="591" alt="PROFİL2" src="https://github.com/user-attachments/assets/ea4d4ae9-f37b-44cb-aef2-cd6ee17085aa" />




**🗺️ YolYap Project – Setup & Run Guide**
======================================================

**YolYap** is a full-stack application that provides route planning, map-based interaction, and AI-powered recommendations. This document is a complete guide to install and run the project.

**📚 Table of Contents**
------------------

1.  About the Project
    
2.  Architecture Overview
    
3.  Requirements
    
4.  Setup Steps
   
    *   Clone Repository
        
    *   Frontend (Next.js)
        
    *   Backend (FastAPI)
        
5.  Run Flow
    
6.  Project Structure
    
7.  Development & Contribution
    
8.  Sample .gitignore
    

    

**🚀 About the Project**

*   Frontend (frontend/) → Next.js-based UI (Map, Chat, UI).
    
*   Backend (backend/) → FastAPI-based API (Route planning, AI/LLM/MCP).
    

**🏗️ Architecture Overview**

User → Frontend (Next.js) → Backend (FastAPI)  → MCP system or LLM → Response

Backend communicates with OpenAI API. Frontend uses Mapbox API for map services.

**🔧 Requirements**
--------------------

*   Node.js 20+ (LTS recommended)
    
*   Python 3.11 / 3.12 (⚠ 3.13 not supported)
    
*   Git, cURL
    
*   Package manager: npm, yarn, or pnpm
    
*   Required API keys: Mapbox Public Token, Mapbox Server Token, OpenAI API Key, Google API Key
    

**⚙️ Setup Steps**
-----------------------

**1) Clone the Repository**

git clone

cd YolYap\-Proje

### **2) Frontend (Next.js)**

cd frontend

npm install

npm run dev  → http://localhost:3000

### **3) Backend (FastAPI)**

cd backend

python -m venv .venv

source .venv/bin/activate  (Windows: .venv\\Scripts\\activate)

pip install -r requirements.txt

uvicorn main:app –reload –port 8080  → http://localhost:8080/docs


**▶️ Run Flow**
-----------------------

1.  Start Backend → uvicorn main:app --reload
   
2.  Start MCP → npx @modelcontextprotocol/inspector (https://mcp.turkishtechlab.com)
    
3.  Start Frontend → npm run dev (inside frontend)
    
4.  Open browser → http://localhost:3000
    

**📂 Project Structure**
--------------------

YolYap\_Proje/

├── backend/ (FastAPI)

│   ├── api/

│   ├── auth/

│   ├── features/

│   └── requirements.txt

│   └── main.py

│   └── mcp_client.py

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


**🤝 Development & Contribution**
--------------------------

1.  Fork the repository
    
2.  Create a new branch: (git checkout -b feature/new-feature)
    
3.  Commit your changes
    
4.  PPush & open a Pull Request
    

**📑 Sample .gitignore**
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

.DS\_Store

.idea/

.vscode/

