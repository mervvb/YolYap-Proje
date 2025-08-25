
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



### Functions:
- **get_traffic_info:** Returns traffic status for the specified location and time.  
- **get_flight_status:** Provides flight information based on flight number or date.  
- **convert_speech_to_text:** Converts a voice command into text (In Development).  
- **convert_text_to_speech:** Converts a text response into speech (In Development).  



### Response Format:
After a function call, the LLM returns a structured response like this:

```json

{
  "response_text": "At 08:00 in Istanbul, traffic density is at 75%, with slowdowns observed on major roads.",
  "data": {
    "traffic_level": "high",
    "affected_roads": ["E-5", "TEM Highway"]
  }
}


# Example Usage Scenarios

### 1. Traffic Information Query
**User:** "What’s the traffic like in Istanbul right now?"

**System:**
- The LLM calls the `get_traffic_info` function.  
- Traffic data is retrieved from the **Mapbox API**.  
- The user is provided with traffic density and alternative route suggestions.  



### 2. Flight Status Query
**User:** "What time does Turkish Airlines flight TK123 depart?"

**System:**
- The LLM calls the `get_flight_status` function.  
- Flight data is retrieved from the **THY MCP API**.  
- The user is informed about the departure time and current flight status.  



### 3. Voice Command Query (In Development)
**User (Voice):** "What’s the road situation to Ankara today?"

**System:**
- The speech recognition module converts the voice command into text.  
- The LLM processes the query and calls the appropriate function(s).  
- The response is then synthesized into speech and delivered to the user.  



## Future Enhancements
- **Multilingual Support:** Extend support beyond Turkish to other languages.  
- **Advanced Speech Processing:** Improved noise cancellation and more natural speech synthesis.  
- **Learning Models:** LLM continuously updated through user feedback.  
- **Real-Time Alerts:** Instant notification system for accidents and emergencies.  
- **Extended Function Calls:** Integration with new data sources and services.  



📖 This document provides a comprehensive explanation of LLM usage in the **YolYap Project** and serves as a guide for new developers joining the project.  





