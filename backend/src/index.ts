import express from "express"
import session from "express-session"
import cors from "cors"
import dotenv from "dotenv"
import { sharedJar, createMcpClient } from "./mcpClient.js"

dotenv.config()

const app = express()
app.use(cors({ origin: "*", credentials: true }))
app.use(express.json())
app.use(session({
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false
}))

// 1) THY login akışı (bir kere tarayıcıda giriş yap)
app.get("/thy/login", (_req, res) => {
  const redirectUri = `${process.env.PUBLIC_BASE || "http://127.0.0.1:9090"}/thy/callback`
  const url = `https://mcp.turkishtechlab.com/sso-start?redirect_uri=${encodeURIComponent(redirectUri)}`
  res.redirect(url)
})

app.get("/thy/callback", (_req, res) => {
  res.send("THY oturum tamamlandı. Bu pencereyi kapatıp uygulamaya dönebilirsiniz.")
})

// 2) MCP tool: Search Flights
app.post("/thy/search-flights", async (req, res) => {
  try {
    const { origin, destination, date, pax = 1 } = req.body || {}
    if (!origin || !destination || !date) {
      return res.status(400).json({ error: "origin, destination, date gerekli" })
    }
    const client = await createMcpClient(process.env.MCP_SSE_URL || "https://mcp.turkishtechlab.com/sse", sharedJar)

    const result = await client.callTool({
      name: "Search Flights",
      arguments: { origin, destination, date, pax }
    })

    await client.close()
    res.json(result)
  } catch (e:any) {
    console.error("Search Flights error:", e)
    res.status(502).json({ error: String(e?.message || e) })
  }
})

const PORT = Number(process.env.BRIDGE_PORT || 9090)
app.listen(PORT, () => console.log(`mcp-bridge listening on ${PORT}`))