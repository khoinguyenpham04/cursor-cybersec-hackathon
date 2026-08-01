import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { PrReviewer } from './agents/pr-reviewer.ts';

const app = new Hono();

// One conversation per review session, keyed by id:
//
//   curl -X POST http://localhost:5173/agents/pr-reviewer/review-1 \
//     -H 'content-type: application/json' \
//     -d '{"kind":"user","body":"Review https://github.com/owner/repo/pull/123"}'
//
// The Next.js app in ../web proxies /api/agents/* here, so the browser client
// stays same-origin and no CORS setup is needed.
app.route('/agents/pr-reviewer', createAgentRouter(PrReviewer));

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
