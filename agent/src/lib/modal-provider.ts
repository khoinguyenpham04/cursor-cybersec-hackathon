import { createProvider, envApiKeyAuth, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { setProvider } from '@flue/runtime';

const DEFAULT_BASE_URL =
	'https://khoinguyenpham04--ep-kimi-k3-server.us-west.modal.direct/v1';

/** Pi specifier used by every agent/subagent unless an env override is set. */
export const MODAL_KIMI_MODEL = 'modal/moonshotai/Kimi-K3';

/** Register the Modal OpenAI-compatible endpoint as Flue provider `modal`. */
export function registerModalProvider(): void {
	const baseUrl = (process.env.MODAL_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');

	const kimiK3: Model<'openai-completions'> = {
		id: 'moonshotai/Kimi-K3',
		name: 'Kimi K3 (Modal)',
		api: 'openai-completions',
		provider: 'modal',
		baseUrl,
		reasoning: true,
		input: ['text'],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 1_048_576,
		maxTokens: 65_536,
	};

	setProvider(
		createProvider({
			id: 'modal',
			name: 'Modal',
			baseUrl,
			auth: {
				apiKey: envApiKeyAuth('Modal proxy token', ['MODAL_API_KEY']),
			},
			models: [kimiK3],
			api: openAICompletionsApi(),
		}),
	);
}

registerModalProvider();
