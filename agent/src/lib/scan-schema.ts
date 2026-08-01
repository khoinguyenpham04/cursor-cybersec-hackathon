// Structured contract for a codebase scan — the foglamp-style architecture
// map. The scanner agent's final act is a submit_scan tool call validated by
// this schema; the web UI renders the payload on an interactive canvas.
// Mirrors review-schema.ts structurally.

import * as v from 'valibot';

export const scanNodeSchema = v.object({
	id: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(48),
		v.description('Unique short id, e.g. "chat" or "billing".'),
	),
	label: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(28),
		v.description('Display name, e.g. "Support agent".'),
	),
	kind: v.pipe(
		v.picklist(['entry', 'cron', 'agent', 'model', 'tool', 'service', 'store', 'external']),
		v.description(
			'entry: trigger/route/page/CLI. cron: scheduled job. agent: an AI agent loop. model: an LLM. tool: a capability models call. service: internal business-logic module the project owns. store: DB/cache/index. external: 3rd-party API.',
		),
	),
	sub: v.optional(
		v.pipe(v.string(), v.maxLength(40), v.description('Subtitle, e.g. "/api/chat" or "streamText".')),
	),
	domain: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(80),
			v.description(
				'Favicon domain for a recognizable company/product (openai.com, stripe.com). Omit for internal nodes.',
			),
		),
	),
	group: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(24),
			v.description(
				'Feature/domain grouping ("Billing", "Ingestion") — grouped nodes render as one labeled stack.',
			),
		),
	),
	detail: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(200),
			v.description('One sentence of what it does, shown when the node is clicked.'),
		),
	),
	sourceRef: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(120),
			v.description('Repo path (plus :line) where this lives, e.g. "src/agents/support.ts:42".'),
		),
	),
});

export const scanEdgeSchema = v.object({
	from: v.pipe(v.string(), v.description('Source node id.')),
	to: v.pipe(v.string(), v.description('Target node id.')),
	kind: v.optional(
		v.pipe(
			v.picklist(['calls', 'reads', 'writes', 'triggers']),
			v.description('What the connection does. Prefer setting it.'),
		),
	),
	label: v.optional(
		v.pipe(
			v.string(),
			v.maxLength(24),
			v.description(
				'Only when a specific phrase says more than the kind, e.g. "charges on trial end".',
			),
		),
	),
});

export const scanSchema = v.pipe(
	v.object({
		project: v.object({
			name: v.pipe(v.string(), v.minLength(1), v.maxLength(48)),
			slug: v.pipe(
				v.string(),
				v.regex(/^[a-z0-9-]+$/),
				v.maxLength(48),
				v.description('lowercase-dashed'),
			),
			tagline: v.optional(v.pipe(v.string(), v.maxLength(80))),
			date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/), v.description('YYYY-MM-DD')),
		}),
		nodes: v.pipe(v.array(scanNodeSchema), v.minLength(1), v.maxLength(60)),
		edges: v.pipe(v.array(scanEdgeSchema), v.maxLength(120)),
		stats: v.optional(
			v.object({
				agents: v.optional(v.number()),
				models: v.optional(v.number()),
				tools: v.optional(v.number()),
				integrations: v.optional(v.number()),
			}),
		),
		topModels: v.optional(v.pipe(v.array(v.string()), v.maxLength(3))),
		topTools: v.optional(v.pipe(v.array(v.string()), v.maxLength(10))),
		topIntegrations: v.optional(v.pipe(v.array(v.string()), v.maxLength(10))),
	}),
	// A dangling edge or duplicate id becomes a retryable tool error for the
	// model instead of a broken canvas for the user.
	v.check((scan) => {
		const ids = new Set<string>();
		for (const node of scan.nodes) {
			if (ids.has(node.id)) return false;
			ids.add(node.id);
		}
		return scan.edges.every((edge) => ids.has(edge.from) && ids.has(edge.to));
	}, 'node ids must be unique and every edge from/to must reference a declared node id'),
);

export type ScanNode = v.InferOutput<typeof scanNodeSchema>;
export type ScanEdge = v.InferOutput<typeof scanEdgeSchema>;
export type ScanResult = v.InferOutput<typeof scanSchema>;
