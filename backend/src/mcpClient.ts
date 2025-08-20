import path from "path"
import { fileURLToPath } from "url"
import { CookieJar } from "tough-cookie"
import pkg from "tough-cookie-file-store"
const FileCookieStore = pkg.FileCookieStore
import fetchCookie from "fetch-cookie"
import { fetch as undiciFetch } from "undici"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const cookieFile = path.resolve(__dirname, "../.data/cookies.json")
export const sharedJar = new CookieJar(new FileCookieStore(cookieFile))

export function makeCookieFetch(jar: CookieJar) {
  return fetchCookie(undiciFetch as any, jar) as typeof undiciFetch
}

// Sürüm farklarına dayanıklı: farklı export yollarını dener
async function loadSSETransport(): Promise<any> {
  const tries = [
    "@modelcontextprotocol/sdk/client/sse/index.js",
    "@modelcontextprotocol/sdk/client/sse",
    "@modelcontextprotocol/sdk/dist/esm/client/sse/index.js",
    "@modelcontextprotocol/sdk/dist/client/sse.js",
    "@modelcontextprotocol/sdk" // bazı sürümlerde top-level export ediliyor
  ]
  let lastErr: unknown
  for (const mod of tries) {
    try {
      const m = await import(mod)
      if (m?.SSEClientTransport) return m.SSEClientTransport
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(
    "SSEClientTransport bulunamadı. SDK sürümü farklı olabilir. Son hata: " +
      (lastErr instanceof Error ? lastErr.message : String(lastErr))
  )
}

export async function createMcpClient(mcpSseUrl: string, jar: CookieJar): Promise<Client> {
  const SSEClientTransport = await loadSSETransport()
  const cookieFetch = makeCookieFetch(jar)

  // Bazı sürümlerde URL nesnesi bekleniyor
  const urlObj = new URL(mcpSseUrl)
  const transport = new SSEClientTransport(urlObj, { fetch: cookieFetch as any })

  const client = new Client({ name: "thy-mcp-bridge", version: "1.0.0", transport })
  await client.connect()
  return client
}