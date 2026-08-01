import { defineSubagent, useSkill, useTool } from '@flue/runtime';
import campaignComposerSkill from '../skills/campaign-composer/SKILL.md';
import { listCaseClaims, readCase } from '../tools/ledger.ts';

function CampaignComposer() {
	useTool(readCase);
	useTool(listCaseClaims);
	useSkill(campaignComposerSkill);
	return `You are campaign_composer. Follow the campaign-composer skill.
Return a complete draft campaign (score, trail, narrative, claimIds, recommendedActions).
Do not call submit_campaign — the parent orchestrator does that.`;
}

export const campaignComposer = defineSubagent({
	name: 'campaign_composer',
	description:
		'Composes specialist claims into one supply-chain campaign narrative with PR trail and policy actions.',
	agent: CampaignComposer,
});
