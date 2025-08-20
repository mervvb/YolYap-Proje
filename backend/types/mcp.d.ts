declare module "@modelcontextprotocol/sdk/client/sse/index.js" {
  export class SSEClientTransport {
    constructor(url: string | URL, options?: any)
  }
}
declare module "@modelcontextprotocol/sdk/client/index.js" {
  export class Client {
    constructor(options: any)
    connect(): Promise<void>
    close(): Promise<void>
    callTool(args: any): Promise<any>
  }
}