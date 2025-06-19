/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import { ChatOpenAI } from '@langchain/openai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type IExecuteSingleFunctions,
	type INodeExecutionData,
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
						url: 'https://console.upstage.ai/docs/capabilities/chat',
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
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/models',
							},
							output: {
								postReceive: [
									// Custom function to deduplicate and process models
									async function (
										this: IExecuteSingleFunctions,
										items: INodeExecutionData[],
									): Promise<INodeExecutionData[]> {
										// Extract data from response
										const data = items[0]?.json?.data;
										if (!Array.isArray(data)) return items;

										// Filter Solar models
										const solarModels = data.filter((model: any) => model.id?.startsWith('solar-'));

										// Create name-value pairs and deduplicate
										const modelOptions = solarModels.map((model: any) => ({
											name: model.id,
											value: model.id,
										}));

										// Remove duplicates based on value
										const uniqueModels = modelOptions.filter(
											(item, index, array) =>
												array.findIndex((t) => t.value === item.value) === index,
										);

										// Sort by name
										uniqueModels.sort((a, b) => a.name.localeCompare(b.name));

										return uniqueModels.map((model) => ({ json: model }));
									},
								],
							},
						},
					},
				},
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
		}) as {
			maxTokens?: number;
			temperature?: number;
			reasoningEffort?: string;
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
			streaming: false, // Streaming disabled to avoid stream_options compatibility issues
			configuration,
			callbacks: [new N8nLlmTracing(this)],
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			modelKwargs: {
				...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
			},
		});

		return {
			response: model,
		};
	}
}
