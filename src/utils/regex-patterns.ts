export interface RoutePattern {
  framework: string;
  pattern: RegExp;
  methodGroup: number;
  pathGroup: number;
}

export const ROUTE_PATTERNS: RoutePattern[] = [
  // Express / Hono: app.get('/path', ...) or router.post('/path', ...)
  {
    framework: 'express',
    pattern: /(?:app|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // Hono-specific: app.get('/path', (c) => ...) — same pattern as Express but also catches Hono
  {
    framework: 'hono',
    pattern: /(?:app|api|router)\.(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // FastAPI: @app.get("/path")
  {
    framework: 'fastapi',
    pattern: /@(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 1,
    pathGroup: 2,
  },
  // Flask: @app.route("/path", methods=["GET"])
  {
    framework: 'flask',
    pattern: /@(?:app|bp|blueprint)\.route\s*\(\s*['"`]([^'"`]+)['"`]/gi,
    methodGroup: 0,
    pathGroup: 1,
  },
  // Next.js App Router: export async function GET/POST/PUT/DELETE(
  {
    framework: 'nextjs',
    pattern: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/gi,
    methodGroup: 1,
    pathGroup: 0,
  },
  // Go net/http: http.HandleFunc("/path", handler) or r.HandleFunc("/path", handler)
  {
    framework: 'go-http',
    pattern: /\.(?:HandleFunc|Handle)\s*\(\s*"([^"]+)"/gi,
    methodGroup: 0,
    pathGroup: 1,
  },
];

export const TYPE_EXPORT_PATTERNS = {
  typescript: {
    interface: /export\s+interface\s+(\w+)/g,
    type: /export\s+type\s+(\w+)\s*=/g,
    enum: /export\s+enum\s+(\w+)/g,
    class: /export\s+class\s+(\w+)/g,
  },
  python: {
    class: /class\s+(\w+)\s*[\(:]|(\w+)\s*=\s*TypeVar/g,
  },
};

export const IMPORT_PATTERNS = {
  typescript: /(?:import\s+(?:type\s+)?{[^}]+}\s+from|import\s+\w+\s+from|require\s*\()\s*['"`]([^'"`]+)['"`]/g,
  python: /(?:from\s+(\S+)\s+import|import\s+(\S+))/g,
};

export const ENV_PATTERNS = {
  // process.env.VAR_NAME or process.env['VAR_NAME']
  nodeProcessEnv: /process\.env\.(\w+)|process\.env\[['"`](\w+)['"`]\]/g,
  // os.environ.get('VAR') or os.environ['VAR']
  pythonOsEnviron: /os\.environ(?:\.get)?\s*\(\s*['"`](\w+)['"`]|os\.environ\[['"`](\w+)['"`]\]/g,
  // Deno.env.get('VAR')
  denoEnv: /Deno\.env\.get\s*\(\s*['"`](\w+)['"`]\)/g,
  // .env file: VAR=value
  dotEnv: /^(\w+)\s*=/gm,
};

export const DB_PATTERNS = {
  // Prisma model
  prismaModel: /model\s+(\w+)\s*\{/g,
  // Drizzle table
  drizzleTable: /(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"`](\w+)['"`]/g,
  // SQLAlchemy model
  sqlalchemyModel: /class\s+(\w+)\s*\([^)]*(?:Base|db\.Model)[^)]*\)/g,
  // TypeORM entity
  typeormEntity: /@Entity\s*\(\s*(?:['"`](\w+)['"`])?\s*\)/g,
};

export const FRAMEWORK_INDICATORS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'next', '@tanstack/react-query'],
  vue: ['vue', 'nuxt', '@vue/'],
  angular: ['@angular/core'],
  svelte: ['svelte', '@sveltejs/'],
  express: ['express'],
  hono: ['hono'],
  fastify: ['fastify'],
  nestjs: ['@nestjs/core'],
  django: ['django'],
  flask: ['flask'],
  fastapi: ['fastapi'],
  gin: ['github.com/gin-gonic/gin'],
  prisma: ['prisma', '@prisma/client'],
  drizzle: ['drizzle-orm'],
};
