'use agent';
import { useModel, usePersistentState, useSkill, useSubagent, useTool } from '@flue/runtime';
import * as v from 'valibot';
import campaignOrchestratorSkill from '../skills/campaign-orchestrator/SKILL.md';
import { campaignComposer } from '../subagents/campaign-composer.ts';
import { ciAuditor } from '../subagents/ci-auditor.ts';
import { graphAnalyst } from '../subagents/graph-analyst.ts';
import { provenanceScout } from '../subagents/provenance-scout.ts';
import { submitCampaign } from '../tools/campaign.ts';
import { investigateCase } from '../tools/investigate.ts';
import { loadFixtureCase, readCase } from '../tools/ledger.ts';

type Phase = 'loading' | 'investigating' | 'composing' | 'submitted';

// Thin parent: load case → investigate_case (control plane) → submit_campaign.
// Specialist fan-out is enforced inside investigate_case (durable + harness),
// not by hoping the model issues parallel task calls.
export function CampaignOrchestrator() {
	useModel(process.env.CAMPAIGN_ORCHESTRATOR_MODEL || 'anthropic/claude-opus-5');

	const [phase, setPhase] = usePersistentState<Phase>('phase', 'loading');
	const [caseId, setCaseId] = usePersistentState<string | null>('caseId', null);
	const [runId, setRunId] = usePersistentState<string | null>('runId', null);

	useTool(loadFixtureCase);
	useTool(readCase);
	useTool(investigateCase);
	useTool(submitCampaign);

	useTool({
		name: 'set_review_context',
		description:
			'Persist caseId + runId after the case is loaded and advance phase. Call once before investigate_case.',
		input: v.object({
			caseId: v.string(),
			runId: v.string(),
			phase: v.optional(v.picklist(['investigating', 'composing', 'submitted'])),
		}),
		async run({ data }) {
			setCaseId(data.caseId);
			setRunId(data.runId);
			setPhase(data.phase ?? 'investigating');
			return {
				output: {
					ok: true,
					caseId: data.caseId,
					runId: data.runId,
					phase: data.phase ?? 'investigating',
				},
			};
		},
	});

	// Specialists must stay mounted so investigate_case harness can task them.
	useSubagent(graphAnalyst);
	useSubagent(provenanceScout);
	useSubagent(ciAuditor);
	useSubagent(campaignComposer);
	useSkill(campaignOrchestratorSkill);

	return `You are the CampaignOrchestrator for open-source supply-chain campaign detection.

Current phase: ${phase}.
caseId: ${caseId ?? '(none)'}.
runId: ${runId ?? '(none)'}.

Follow the campaign-orchestrator skill exactly.
When the user asks for the boiling-frog / fixture demo, load caseId "fixture-boiling-frog".

Protocol:
1) load_fixture_case (if needed) → read_case → set_review_context(caseId, runId)
2) investigate_case({ caseId, runId }) — this is the ONLY fan-out path; do not manually task specialists
3) submit_campaign from the packet.draft (caseId, verdict, campaignScore, trail, narrative, claimIds, recommendedActions, headline)
4) One short closing sentence after submit_campaign succeeds.`;
}
CampaignOrchestrator.agentName = 'campaign-orchestrator';
