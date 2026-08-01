// Structured result contract for the PR reviewer, modeled on emdash's
// flue-review schema and the adversarial-reviewer skill's output format.
// Findings are line-anchored (path/line/side, GitHub review API shaped) so a
// future orchestrator can post them as review comments with no translation.

import * as v from 'valibot';

export const findingSchema = v.object({
	title: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(120),
		v.description('Short bug title, e.g. "Retry loop runs maxRetries + 1 times".'),
	),
	path: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(400),
		v.description('Repo-relative file path the finding anchors to (no leading slash).'),
	),
	line: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(1),
		v.description(
			'Line number to anchor on, using NEW file line numbers for RIGHT and old numbers for LEFT (the end line for a multi-line range).',
		),
	),
	startLine: v.optional(
		v.pipe(
			v.number(),
			v.integer(),
			v.minValue(1),
			v.description('Start line for a multi-line range. Omit for a single-line finding.'),
		),
	),
	side: v.pipe(
		v.picklist(['LEFT', 'RIGHT']),
		v.description('RIGHT for added or changed lines, LEFT for deleted lines.'),
	),
	category: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(60),
		v.description(
			'Checklist category from the review skill, e.g. "Logic Errors", "Edge Cases & Boundaries", "Error Handling", "State & Concurrency", "Security", "Data Integrity", "Resource Management".',
		),
	),
	severity: v.pipe(
		v.picklist(['critical', 'high', 'medium', 'low']),
		v.description(
			'critical: data loss, security vulnerability, crash in production. high: wrong behavior users hit in normal usage. medium: wrong behavior in edge cases, resource leaks under load. low: cosmetic logic issues, unnecessary work, misleading names.',
		),
	),
	body: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(4000),
		v.description(
			"What's wrong, in one or two markdown sentences with no filler. State what the code does and why it is wrong.",
		),
	),
	trigger: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(2000),
		v.description('Concrete scenario (inputs, sequence, or race) that hits this bug.'),
	),
	fix: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(4000),
		v.description(
			'Minimal code change or approach, in markdown. A short code block when a concrete fix helps; do not rewrite the function.',
		),
	),
});

export const reviewSchema = v.object({
	verdict: v.pipe(
		v.picklist(['approve', 'comment', 'request_changes']),
		v.description(
			'approve: you would sign off, no blocking issues (usually no findings or LOW only). comment: non-blocking findings — the default whenever you found things. request_changes: reserve for true blockers (security vulnerability, data loss, a crash or break this PR introduces).',
		),
	),
	summary: v.pipe(
		v.string(),
		v.minLength(1),
		v.maxLength(6000),
		v.description(
			'Overall review summary in GitHub-flavored markdown: what you checked and the headline conclusion. If you found nothing, say "No bugs found" and why you are confident.',
		),
	),
	findings: v.pipe(
		v.array(findingSchema),
		v.maxLength(50),
		v.description('Line-anchored findings, ordered most severe first. Empty when the PR is clean.'),
	),
});

export type ReviewFinding = v.InferOutput<typeof findingSchema>;
export type ReviewResult = v.InferOutput<typeof reviewSchema>;
