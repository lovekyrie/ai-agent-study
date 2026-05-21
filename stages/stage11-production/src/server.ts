import http from 'node:http'
import { URL } from 'node:url'

// HTTP Request/Response interfaces
export interface HttpRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query: Record<string, string>
  params: Record<string, string>
  context?: RequestContext
}

export interface HttpResponse {
  statusCode: number
  headers: Record<string, string>
  body: unknown
}

export interface RequestContext {
  requestId: string
  userId?: string
  startTime: number
}

// Route handler type
export type RouteHandler = (
  req: HttpRequest,
  res: HttpResponse,
) => Promise<HttpResponse> | HttpResponse

// Route definition
export interface Route {
  method: string
  path: string
  handler: RouteHandler
  middlewares?: Middleware[]
}

export type Middleware = (
  req: HttpRequest,
  res: HttpResponse,
  next: () => Promise<void>,
) => Promise<void>

// Simple HTTP server
export class HttpServer {
  private server?: http.Server
  private routes: Route[] = []
  private globalMiddlewares: Middleware[] = []
  private maxBodyBytes = 1024 * 1024

  use(middleware: Middleware): void {
    this.globalMiddlewares.push(middleware)
  }

  addRoute(route: Route): void {
    this.routes.push(route)
  }

  // HTTP method helpers
  get(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
    this.addRoute({ method: 'GET', path, handler, middlewares })
  }

  post(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
    this.addRoute({ method: 'POST', path, handler, middlewares })
  }

  put(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
    this.addRoute({ method: 'PUT', path, handler, middlewares })
  }

  delete(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
    this.addRoute({ method: 'DELETE', path, handler, middlewares })
  }

  patch(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
    this.addRoute({ method: 'PATCH', path, handler, middlewares })
  }

  async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const context: RequestContext = {
      requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      startTime: Date.now(),
    }

    let body: unknown
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      body = await this.parseBody(req)
    }

    const url = new URL(req.url || '/', 'http://localhost')
    const query: Record<string, string> = {}
    for (const [key, value] of url.searchParams.entries()) {
      query[key] = value
    }

    const headers: Record<string, string | string[] | undefined> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = value
    }

    const httpReq: HttpRequest = {
      method: req.method || 'GET',
      url: url.pathname,
      headers,
      body,
      query,
      params: {},
      context,
    }

    const httpRes: HttpResponse = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: null,
    }

    try {
      // Find matching route
      const route = this.findRoute(httpReq.method, httpReq.url)
      if (!route) {
        httpRes.statusCode = 404
        httpRes.body = { error: 'Not found' }
        this.sendResponse(res, httpRes)
        return
      }

      // Parse route params
      httpReq.params = this.extractParams(route.path, httpReq.url)

      // Run middlewares
      const middlewares = [
        ...this.globalMiddlewares,
        ...(route.middlewares || []),
      ]

      for (const middleware of middlewares) {
        await middleware(httpReq, httpRes, async () => {})
        if (httpRes.statusCode >= 400 && httpRes.body !== null) {
          this.sendResponse(res, httpRes)
          return
        }
      }

      // Execute handler
      const result = await route.handler(httpReq, httpRes)
      httpRes.body = result.body
      httpRes.statusCode = result.statusCode

      if (result.headers) {
        Object.assign(httpRes.headers, result.headers)
      }

      this.sendResponse(res, httpRes)
    }
    catch (error) {
      httpRes.statusCode = 500
      httpRes.body = {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error),
      }
      this.sendResponse(res, httpRes)
    }
  }

  private async parseBody(req: http.IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = ''
      let bytes = 0
      req.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > this.maxBodyBytes) {
          reject(new Error(`Request body too large. Limit is ${this.maxBodyBytes} bytes`))
          req.destroy()
          return
        }
        body += chunk.toString()
      })
      req.on('end', () => {
        if (!body) {
          resolve(undefined)
          return
        }
        try {
          resolve(JSON.parse(body))
        }
        catch {
          resolve(body)
        }
      })
      req.on('error', reject)
    })
  }

  private findRoute(method: string, url: string): Route | undefined {
    return this.routes.find((route) => {
      if (route.method !== method)
        return false
      const pattern = this.pathToRegex(route.path)
      return pattern.test(url)
    })
  }

  private extractParams(path: string, url: string): Record<string, string> {
    const params: Record<string, string> = {}
    const pathParts = path.split('/')
    const urlParts = url.split('/')

    for (let i = 0; i < pathParts.length; i++) {
      if (pathParts[i].startsWith(':')) {
        const paramName = pathParts[i].slice(1)
        params[paramName] = urlParts[i] || ''
      }
    }

    return params
  }

  private pathToRegex(path: string): RegExp {
    const pattern = path
      .replace(/:[^/]+/g, '([^/]+)')
      .replace(/\//g, '\\/')
    return new RegExp(`^${pattern}$`)
  }

  private sendResponse(res: http.ServerResponse, httpRes: HttpResponse): void {
    res.statusCode = httpRes.statusCode
    for (const [key, value] of Object.entries(httpRes.headers)) {
      res.setHeader(key, value)
    }
    res.end(JSON.stringify(httpRes.body))
  }

  async listen(port: number, hostname?: string): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res))
    await new Promise<void>((resolve) => {
      this.server!.listen(port, hostname, () => resolve())
    })
  }

  async close(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve())
      })
    }
  }
}

// Common middlewares
export function withAuth(authService: { verifyToken: (token: string) => { userId: string, valid: boolean } }) {
  return async (req: HttpRequest, res: HttpResponse, next: () => Promise<void>) => {
    const authHeader = req.headers.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      res.statusCode = 401
      res.body = { error: 'Unauthorized' }
      return
    }

    const token = authHeader.slice(7)
    const result = authService.verifyToken(token)

    if (!result.valid) {
      res.statusCode = 401
      res.body = { error: 'Invalid token' }
      return
    }

    req.context!.userId = result.userId
    await next()
  }
}

export function withCors(options: { origins?: string[] } = {}) {
  return async (_req: HttpRequest, res: HttpResponse, next: () => Promise<void>) => {
    res.headers['Access-Control-Allow-Origin'] = options.origins?.join(',') || '*'
    res.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS'
    res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    await next()
  }
}

export function withJsonBody() {
  return async (req: HttpRequest, _res: HttpResponse, next: () => Promise<void>) => {
    const contentType = req.headers['content-type']
    if (contentType?.includes('application/json') && typeof req.body === 'string') {
      try {
        req.body = JSON.parse(req.body)
      }
      catch {
        // Keep as string if parse fails
      }
    }
    await next()
  }
}
