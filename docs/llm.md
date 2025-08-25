
# 👀Rotalist

## LLM (AI Assistant) Usage Documentation 

---

## 🎯 Purpose
This document explains in detail the usage and integration of the LLM (Large Language Model)-based AI assistant within the **YolYap Project**.   

The AI assistant processes text-based inputs to enhance the user experience. It is designed not only to answer traffic and route questions but also to provide historical and cultural information, helping users learn about the places they are interested in.  

Additionally, the user interface includes **ready prompts** (short predefined questions/requests), enabling users to quickly get information or create routes with one click.  

---


## 🏗️ Architecture
The LLM architecture in the YolYap Project is modular and integrates information from multiple data sources to respond to user requests.  

**Core Components**:  
- **User Interface (UI):** Collects text input and displays responses.  
- **LLM Engine:** OpenAI-based text-to-text model for natural language processing.  
- **Map & Traffic Integration:** Fetches real-time traffic data via the Mapbox API.  
- **Flight Data Integration:** Queries flight information from Turkish Airlines MCP system.  
- **Function Calling Module:** Handles external API interactions triggered by the LLM.  

---

## 🤖 Models Used
- **OpenAI Text-to-Text Model:** For understanding user queries and generating natural language responses.  
- **Speech Recognition & Synthesis Modules:** Google Speech-to-Text and Text-to-Speech APIs (or similar) for voice input/output (in development).  
- **Mapbox Traffic Data:** Provides real-time traffic and road condition information.  
- **THY MCP Integration:** Enables access to Turkish Airlines data (flight status, departure/arrival info).  

---

## 🔗 Integration Flow
1. User enters a text command via the interface.  
2. The text is sent to the **OpenAI LLM model**.  
3. The LLM analyzes the request and triggers **function calls** if necessary.  
4. External APIs (Mapbox or THY MCP) are queried.  
5. Data is processed by the LLM.  
6. The assistant generates a final **text response**.  
7. The response is displayed (or spoken) to the user.  

---


## ⚙️ Function Calling

LLM can call specific functions depending on the query.  
Function calls follow **JSON format**:  

**Example:**
```json
{
  "name": "get_traffic_info",
  "parameters": {
    "location": "Istanbul",
    "time": "2024-06-01T08:00:00Z"
  }
}



