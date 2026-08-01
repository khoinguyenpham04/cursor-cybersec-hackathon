import { defineTool, type JsonValue } from '@flue/runtime';
import { scanSchema } from '../lib/scan-schema.ts';

// The scanner's final act: deliver the architecture map as validated
// structured data. Like submit_review, the tool does no work — the value is
// the schema-checked input the web UI reads off the conversation stream and
// renders on the interactive canvas. Validation failures (dangling edges,
// duplicate ids, over-cap labels) surface to the model as tool errors, so a
// malformed scan gets retried rather than silently rendered.
export const submitScan = defineTool({
	name: 'submit_scan',
	description:
		'Submit the final codebase scan: project info plus the architecture map (nodes and edges). Call this exactly once, after investigating the repository per the scan skill. This replaces writing the map as chat text — put the full scan here, never paste the JSON into chat.',
	input: scanSchema,
	async run({ data, log }): Promise<{ output: JsonValue }> {
		log.info(
			`Scan submitted: ${data.project.slug}, ${data.nodes.length} nodes, ${data.edges.length} edges`,
		);
		return {
			output: {
				recorded: true,
				nodes: data.nodes.length,
				edges: data.edges.length,
			},
		};
	},
});
