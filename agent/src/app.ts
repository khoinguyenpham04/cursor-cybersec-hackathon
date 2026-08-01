import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { CampaignOrchestrator } from './agents/campaign-orchestrator.ts';
import { PrReviewer } from './agents/pr-reviewer.ts';
import { RepoScanner } from './agents/repo-scanner.ts';
import './lib/modal-provider.ts';

const app = new Hono();

// One conversation per review session, keyed by id:
//
//   curl -X POST http://localhost:5173/agents/pr-reviewer/review-1 \
//     -H 'content-type: application/json' \
//     -d '{"kind":"user","body":"Review https://github.com/owner/repo/pull/123"}'
//
// Campaign path (supply-chain composition):
//   curl -X POST http://localhost:5173/agents/campaign-orchestrator/demo-1 \
//     -H 'content-type: application/json' \
//     -d '{"kind":"user","body":"Review fixture-boiling-frog"}'
//
// The Next.js app in ../web proxies /api/agents/* here, so the browser client
// stays same-origin and no CORS setup is needed.
app.route('/agents/pr-reviewer', createAgentRouter(PrReviewer));
app.route('/agents/campaign-orchestrator', createAgentRouter(CampaignOrchestrator));

// One conversation per repository (id convention: scan-{owner}--{repo}), so
// a scan is durable: revisiting the repo replays the map for free and
// "rescan" is just another message in the same conversation.
app.route('/agents/repo-scanner', createAgentRouter(RepoScanner));

app.get('/api/health', (c) => c.json({ ok: true }));

export default app;
