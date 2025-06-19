/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import { ChatOpenAI } from '@langchain/openai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

import { getHttpProxyAgent } from '@utils/httpProxyAgent';
import { getConnectionHintNoticeField } from '@utils/sharedFields';

import { makeN8nLlmFailedAttemptHandler } from '../n8nLlmFailedAttemptHandler';
import { N8nLlmTracing } from '../N8nLlmTracing';

export class LmChatUpstage implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Solar Chat Model',
		// eslint-disable-next-line n8n-nodes-base/node-class-description-name-miscased
		name: 'lmChatUpstage',
		icon: 'file:upstage.svg',
		group: ['transform'],
		version: 1,
		description: 'For advanced usage with an AI chain',
		defaults: {
			name: 'Solar Chat Model',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatupstage/',
					},
				],
			},
		},
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'upstageApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: 'https://api.upstage.ai/v1',
		},
		properties: [
			getConnectionHintNoticeField([NodeConnectionTypes.AiChain, NodeConnectionTypes.AiAgent]),
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description:
					'The model which will generate the completion. <a href="https://developers.upstage.ai/docs/getting-started/models">Learn more</a>.',
				options: [
					{
						name: 'solar-pro2-preview',
						value: 'solar-pro2-preview',
					},
					{
						name: 'solar-pro',
						value: 'solar-pro',
					},
					{
						name: 'solar-mini',
						value: 'solar-mini',
					},
				],
				routing: {
					send: {
						type: 'body',
						property: 'model',
					},
				},
				default: 'solar-pro2-preview',
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: 4096,
						description: 'The maximum number of tokens to generate in the completion',
						type: 'number',
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Reasoning Effort',
						name: 'reasoningEffort',
						type: 'options',
						options: [
							{
								name: 'Low',
								value: 'low',
							},
							{
								name: 'Medium',
								value: 'medium',
							},
							{
								name: 'High',
								value: 'high',
							},
						],
						default: 'medium',
						description: 'The reasoning effort for the model to use',
					},
					{
						displayName: 'Stream',
						name: 'stream',
						type: 'boolean',
						default: false,
						description: 'Whether to stream the response',
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('upstageApi');

		const modelName = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {
			maxTokens: 4096,
			temperature: 0.7,
			reasoningEffort: 'medium',
			stream: false,
		}) as {
			maxTokens?: number;
			temperature?: number;
			reasoningEffort?: string;
			stream?: boolean;
		};

		const configuration = {
			baseURL: 'https://api.upstage.ai/v1',
			httpAgent: getHttpProxyAgent(),
		};

		const model = new ChatOpenAI({
			openAIApiKey: credentials.apiKey as string,
			modelName,
			maxTokens: options.maxTokens,
			temperature: options.temperature,
			streaming: false, // Disable streaming for now to avoid stream_options issue
			configuration,
			callbacks: [new N8nLlmTracing(this)],
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			modelKwargs: {
				stream: options.stream, // Pass stream in modelKwargs instead
				...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
			},
		});

		return {
			response: model,
		};
	}
}
