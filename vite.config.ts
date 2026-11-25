import { defineConfig, type Plugin } from 'vite';

/**
 * Dev only: answer /api/* with the real Netlify function code and an in-memory store, so the
 * leaderboard and accounts can be tried locally. Google is stood in for: a credential
 * "dev:<anything>" signs in as that account. This exists only in the dev server; the deployed
 * function checks Google's signature. Scores vanish when the dev server stops.
 */
function devScores(): Plugin {
  const mem = new Map<string, unknown>();
  const store = { get: async (k: string) => mem.get(k) ?? null, setJSON: async (k: string, v: unknown) => void mem.set(k, structuredClone(v)), delete: async (k: string) => void mem.delete(k) };
  const verify = async (c: string) => (c.startsWith('dev:') && c.length > 4 ? { sub: c.slice(4), given: c.slice(4) } : null);
  return {
    name: 'dev-scores',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const mod = await server.ssrLoadModule('/netlify/functions/api.ts');
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = req.method === 'POST' ? Buffer.concat(chunks).toString() : undefined;
        const out: Response = await mod.handle(new Request(`http://localhost${req.originalUrl ?? req.url}`, { method: req.method, body, headers: { authorization: String(req.headers.authorization ?? '') } }), { store, verify });
        res.statusCode = out.status;
        res.setHeader('content-type', 'application/json');
        res.end(await out.text());
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [devScores()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    // The fonts travel inside the CSS, so the look is the same on every machine and the test copy is one file.
    assetsInlineLimit: (file: string) => (file.endsWith('.woff2') ? true : false),
  },
});
