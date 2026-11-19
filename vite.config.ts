import { defineConfig, type Plugin } from 'vite';

/**
 * Dev only: answer /api/scores with the real Netlify function code and an in-memory store, so
 * the leaderboard can be tried locally. Scores vanish when the dev server stops.
 */
function devScores(): Plugin {
  const mem = new Map<string, unknown>();
  const store = { get: async (k: string) => mem.get(k) ?? null, setJSON: async (k: string, v: unknown) => void mem.set(k, v) };
  return {
    name: 'dev-scores',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/scores', async (req, res) => {
        const mod = await server.ssrLoadModule('/netlify/functions/scores.ts');
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = req.method === 'POST' ? Buffer.concat(chunks).toString() : undefined;
        const out: Response = await mod.handle(new Request(`http://localhost${req.originalUrl ?? req.url}`, { method: req.method, body }), store);
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
    assetsInlineLimit: 0,
  },
});
