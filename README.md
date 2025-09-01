**🗺️ YolYap Project – Preview**
======================================================

<img width="1215" height="837" alt="Ekran Resmi 2025-08-21 21 59 19" src="https://github.com/user-attachments/assets/586e79ca-a28f-452a-8d1e-a2657ac3d8ba" />


<img width="1213" height="835" alt="Ekran Resmi 2025-08-21 21 59 57" src="https://github.com/user-attachments/assets/f29882b9-5df1-41f3-8d83-9e5b794d7242" />


<img width="1224" height="839" alt="Ekran Resmi 2025-08-21 22 30 57" src="https://github.com/user-attachments/assets/c5c155bf-8903-44bc-918f-45cbe0e5b6bf" />


<img width="1213" height="839" alt="Ekran Resmi 2025-08-21 22 31 12" src="https://github.com/user-attachments/assets/c302fd8e-c4c8-4cd2-882e-8ffac974c3c3" />


<img width="1213" height="834" alt="Ekran Resmi 2025-08-21 22 31 50" src="https://github.com/user-attachments/assets/1c710e8c-b535-43b1-9df9-1077b22aca96" />


<img width="1150" height="633" alt="Ekran Resmi 2025-08-21 22 31 58" src="https://github.com/user-attachments/assets/918d5ea6-093e-4149-b75f-f0f88c9e3bd5" />


<img width="1175" height="704" alt="Ekran Resmi 2025-08-21 22 32 58" src="https://github.com/user-attachments/assets/dcc279bb-bde3-4194-89d4-1e043a82992f" />


<img width="1086" height="669" alt="Ekran Resmi 2025-08-21 22 37 27" src="https://github.com/user-attachments/assets/508ab553-47f8-420d-b1cc-9583707abd04" />


<img width="1162" height="695" alt="Ekran Resmi 2025-08-21 22 38 31" src="https://github.com/user-attachments/assets/361ee5f0-139f-4ae9-b568-e7925144c1c1" />



<img width="505" height="658" alt="Ekran Resmi 2025-08-21 22 39 15" src="https://github.com/user-attachments/assets/69412717-48e5-46cf-97b2-68f766e49b95" />



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

backend/mcp-bridge/.env

.DS\_Store

.idea/

.vscode/

