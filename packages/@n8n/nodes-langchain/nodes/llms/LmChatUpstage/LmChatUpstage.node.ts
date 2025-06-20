/* eslint-disable n8n-nodes-base/node-dirname-against-convention */
import { ChatOpenAI } from '@langchain/openai';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
} from 'n8n-workflow';

import { getHttpProxyAgent } from '@utils/httpProxyAgent';
import { getConnectionHintNoticeField } from '@utils/sharedFields';

import { makeN8nLlmFailedAttemptHandler } from '../n8nLlmFailedAttemptHandler';
import { N8nLlmTracing } from '../N8nLlmTracing';

/**
 * Solar LLM Node with Streaming Support
 *
 * This node implements streaming support for Upstage Solar LLM models and includes
 * an adapter to handle OpenAI-compatible stream_options parameters.
 *
 * Streaming Support:
 * - Native streaming via the "Streaming" option in the node UI
 * - Automatic conversion of OpenAI-style stream_options to Solar LLM format
 *
 * Stream Options Adapter:
 * The adapter handles incoming stream_options from other systems that use OpenAI-compatible APIs:
 *
 * Example OpenAI format:
 * {
 *   "model": "solar-pro",
 *   "messages": [...],
 *   "stream_options": { "include_usage": true }
 * }
 *
 * Gets converted to Solar LLM format:
 * {
 *   "model": "solar-pro",
 *   "messages": [...],
 *   "stream": true
 * }
 *
 * The adapter automatically removes stream_options and enables streaming on the model.
 */

/**
 * Adapter function to convert OpenAI-style stream_options to Solar LLM streaming format
 * @param streamOptions - OpenAI-style stream_options object
 * @returns boolean indicating if streaming should be enabled
 */
function adaptStreamOptions(streamOptions?: any): boolean {
	if (!streamOptions) return false;

	// Handle OpenAI-style stream_options
	if (typeof streamOptions === 'object') {
		// OpenAI stream_options can have { include_usage: boolean }
		// For Solar LLM, we just need to enable streaming if stream_options is present
		return true;
	}

	// Handle boolean stream_options
	if (typeof streamOptions === 'boolean') {
		return streamOptions;
	}

	return false;
}

/**
 * Process model kwargs to filter out stream_options and adapt them for Solar LLM
 * @param modelKwargs - Raw model kwargs that may contain stream_options
 * @returns Processed kwargs with stream_options removed and streaming enabled if needed
 */
function processModelKwargs(modelKwargs: any = {}): { kwargs: any; streamingEnabled: boolean } {
	if (!modelKwargs || typeof modelKwargs !== 'object') {
		return { kwargs: modelKwargs || {}, streamingEnabled: false };
	}

	const { stream_options, ...processedKwargs } = modelKwargs;
	const streamingEnabled = adaptStreamOptions(stream_options);

	if (stream_options) {
		console.log('🔄 Processed stream_options in modelKwargs:', stream_options);
		console.log('✅ Streaming enabled from stream_options:', streamingEnabled);
	}

	return { kwargs: processedKwargs, streamingEnabled };
}

/**
 * Create a custom fetch function that filters stream_options from HTTP requests
 */
function createStreamOptionsFilteringFetch(): typeof fetch {
	return async (url: RequestInfo | URL, options?: RequestInit) => {
		// Filter stream_options from the request body
		if (options?.body && typeof options.body === 'string') {
			try {
				const bodyData = JSON.parse(options.body);
				if (bodyData && typeof bodyData === 'object' && 'stream_options' in bodyData) {
					console.log('🗑️ Filtering stream_options from HTTP request body');
					const { stream_options, ...cleanBody } = bodyData;

					// Enable streaming if stream_options was present
					if (adaptStreamOptions(stream_options)) {
						cleanBody.stream = true;
						console.log('✅ Enabled streaming for Solar LLM');
					}

					const newBody = JSON.stringify(cleanBody);

					// Create new options with updated body and headers
					const newHeaders = new Headers(options.headers);

					// Update Content-Length to match the new body
					newHeaders.set('Content-Length', Buffer.byteLength(newBody, 'utf8').toString());

					options = {
						...options,
						body: newBody,
						headers: newHeaders,
					};
				}
			} catch (error) {
				// If JSON parsing fails, continue with original body
				console.warn('Could not parse request body for stream_options filtering:', error);
			}
		}

		// Use the global fetch function
		return await fetch(url, options);
	};
}

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
					'The model which will generate the completion. <a href="https://developers.upstage.ai/docs/apis/chat">Learn more</a>.',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/models',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'data',
										},
									},
									{
										type: 'filter',
										properties: {
											pass: "={{ $responseItem && $responseItem.id && $responseItem.id.toLowerCase().includes('solar') }}",
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{ $responseItem.id }}',
											value: '={{ $responseItem.id }}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
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
				default: '',
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
						default: -1,
						description:
							'The maximum number of tokens to generate in the completion. Most models have a context length of 2048 tokens (except for the newest models, which support 32,768).',
						type: 'number',
						typeOptions: {
							maxValue: 32768,
						},
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Streaming',
						name: 'streaming',
						default: false,
						description: 'Whether to stream the response',
						type: 'boolean',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('upstageApi');
				const requestOptions = {
					method: 'GET' as const,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
						'Content-Type': 'application/json',
					},
				};

				try {
					const response = await this.helpers.request(
						'https://api.upstage.ai/v1/models',
						requestOptions,
					);

					if (!response?.data || !Array.isArray(response.data)) {
						console.warn('Invalid response format from models API:', response);
						return [{ name: 'solar-mini', value: 'solar-mini' }];
					}

					// Filter for Solar models only, remove duplicates, and sort by version/date (latest first)
					const solarModels = response.data
						.filter((model: any) => model?.id?.toLowerCase().includes('solar'))
						.map((model: any) => ({ name: model.id, value: model.id, ...model }))
						.filter(
							(model: any, index: number, self: any[]) =>
								self.findIndex((m) => m.value === model.value) === index,
						)
						.sort((a: any, b: any) => {
							// Extract version/date information for intelligent sorting
							const extractVersionInfo = (name: string) => {
								// Handle date patterns like "250422" (YYMMDD format)
								const dateMatch = name.match(/(\d{6})$/);
								if (dateMatch) {
									const dateStr = dateMatch[1];
									// Convert YYMMDD to comparable number (assuming 20XX for years)
									const year = 2000 + parseInt(dateStr.substring(0, 2));
									const month = parseInt(dateStr.substring(2, 4));
									const day = parseInt(dateStr.substring(4, 6));
									return {
										hasDate: true,
										date: new Date(year, month - 1, day).getTime(),
										name: name.replace(`-${dateStr}`, ''), // base name without date
									};
								}

								// Handle version patterns like "v1.0", "v2.1", etc.
								const versionMatch = name.match(/v?(\d+)\.?(\d+)?/);
								if (versionMatch) {
									const major = parseInt(versionMatch[1]);
									const minor = parseInt(versionMatch[2] || '0');
									return {
										hasVersion: true,
										version: major * 1000 + minor, // Convert to comparable number
										name: name.replace(versionMatch[0], ''), // base name without version
									};
								}

								return { name };
							};

							const infoA = extractVersionInfo(a.name);
							const infoB = extractVersionInfo(b.name);

							// If both have dates, sort by date (newest first)
							if (infoA.hasDate && infoB.hasDate) {
								return infoB.date! - infoA.date!;
							}

							// If both have versions, sort by version (highest first)
							if (infoA.hasVersion && infoB.hasVersion) {
								return infoB.version! - infoA.version!;
							}

							// If one has date/version and other doesn't, prioritize the one with date/version
							if ((infoA.hasDate || infoA.hasVersion) && !(infoB.hasDate || infoB.hasVersion)) {
								return -1;
							}
							if ((infoB.hasDate || infoB.hasVersion) && !(infoA.hasDate || infoA.hasVersion)) {
								return 1;
							}

							// For models with same base name, apply model tier priority
							if (infoA.name === infoB.name) {
								const getTierPriority = (name: string) => {
									if (name.includes('pro2')) return 4;
									if (name.includes('pro') && !name.includes('pro2')) return 3;
									if (name.includes('solar-1')) return 2;
									if (name.includes('mini')) return 1;
									return 0;
								};

								const priorityA = getTierPriority(a.name);
								const priorityB = getTierPriority(b.name);

								if (priorityA !== priorityB) {
									return priorityB - priorityA;
								}
							}

							// Final fallback: reverse alphabetical (newer names often come later)
							return b.name.localeCompare(a.name);
						});

					if (solarModels.length === 0) {
						console.warn('No Solar models found in API response');
						return [{ name: 'solar-mini', value: 'solar-mini' }];
					}

					return solarModels;
				} catch (error) {
					console.error('Error fetching models:', error);
					// Return default model as fallback
					return [{ name: 'solar-mini', value: 'solar-mini' }];
				}
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('upstageApi');

		let modelName = this.getNodeParameter('model', itemIndex) as string;

		// If no model specified, dynamically fetch and select the latest/best available Solar model
		if (!modelName) {
			try {
				const requestOptions = {
					method: 'GET' as const,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
						'Content-Type': 'application/json',
					},
				};

				const response = await this.helpers.request(
					'https://api.upstage.ai/v1/models',
					requestOptions,
				);

				if (response?.data && Array.isArray(response.data)) {
					const solarModels = response.data
						.filter((model: any) => model?.id?.toLowerCase().includes('solar'))
						.map((model: any) => model.id)
						.sort((a: string, b: string) => {
							// Extract version/date information for intelligent sorting
							const extractVersionInfo = (name: string) => {
								// Handle date patterns like "250422" (YYMMDD format)
								const dateMatch = name.match(/(\d{6})$/);
								if (dateMatch) {
									const dateStr = dateMatch[1];
									// Convert YYMMDD to comparable number (assuming 20XX for years)
									const year = 2000 + parseInt(dateStr.substring(0, 2));
									const month = parseInt(dateStr.substring(2, 4));
									const day = parseInt(dateStr.substring(4, 6));
									return {
										hasDate: true,
										date: new Date(year, month - 1, day).getTime(),
										name: name.replace(`-${dateStr}`, ''), // base name without date
									};
								}

								// Handle version patterns like "v1.0", "v2.1", etc.
								const versionMatch = name.match(/v?(\d+)\.?(\d+)?/);
								if (versionMatch) {
									const major = parseInt(versionMatch[1]);
									const minor = parseInt(versionMatch[2] || '0');
									return {
										hasVersion: true,
										version: major * 1000 + minor, // Convert to comparable number
										name: name.replace(versionMatch[0], ''), // base name without version
									};
								}

								return { name };
							};

							const infoA = extractVersionInfo(a);
							const infoB = extractVersionInfo(b);

							// If both have dates, sort by date (newest first)
							if (infoA.hasDate && infoB.hasDate) {
								return infoB.date! - infoA.date!;
							}

							// If both have versions, sort by version (highest first)
							if (infoA.hasVersion && infoB.hasVersion) {
								return infoB.version! - infoA.version!;
							}

							// If one has date/version and other doesn't, prioritize the one with date/version
							if ((infoA.hasDate || infoA.hasVersion) && !(infoB.hasDate || infoB.hasVersion)) {
								return -1;
							}
							if ((infoB.hasDate || infoB.hasVersion) && !(infoA.hasDate || infoA.hasVersion)) {
								return 1;
							}

							// For models with same base name, apply model tier priority
							if (infoA.name === infoB.name) {
								const getTierPriority = (name: string) => {
									if (name.includes('pro2')) return 4;
									if (name.includes('pro') && !name.includes('pro2')) return 3;
									if (name.includes('solar-1')) return 2;
									if (name.includes('mini')) return 1;
									return 0;
								};

								const priorityA = getTierPriority(a);
								const priorityB = getTierPriority(b);

								if (priorityA !== priorityB) {
									return priorityB - priorityA;
								}
							}

							// Final fallback: reverse alphabetical (newer names often come later)
							return b.localeCompare(a);
						});

					if (solarModels.length > 0) {
						modelName = solarModels[0]; // Select the highest priority (latest) model
						console.log(`🔄 Auto-selected latest Solar model: ${modelName}`);
					}
				}
			} catch (error) {
				console.warn('Failed to fetch models dynamically, using fallback:', error);
			}

			// Final fallback - try pro2 first, then pro, then mini
			if (!modelName) {
				const fallbackModels = ['solar-pro2-preview', 'solar-pro', 'solar-mini'];
				modelName = fallbackModels[0]; // Default to the latest
				console.log(`🔄 Using fallback model: ${modelName}`);
			}
		}

		const options = this.getNodeParameter('options', itemIndex, {}) as {
			maxTokens?: number;
			temperature?: number;
			streaming?: boolean;
		};

		// Process any modelKwargs that might contain stream_options
		const modelKwargs = this.getNodeParameter('modelKwargs', itemIndex, {}) as any;
		const { kwargs: processedKwargs, streamingEnabled } = processModelKwargs(modelKwargs);

		// Determine final streaming setting - prioritize stream_options over user setting
		const finalStreaming = streamingEnabled || options.streaming || false;

		// Create configuration with custom fetch that filters stream_options
		const configuration = {
			baseURL: 'https://api.upstage.ai/v1',
			httpAgent: getHttpProxyAgent(),
			defaultHeaders: {
				'Content-Type': 'application/json',
			},
			// Custom fetch function to filter stream_options from HTTP requests
			fetch: createStreamOptionsFilteringFetch(),
		};

		// Create the model with simple configuration
		const model = new ChatOpenAI({
			openAIApiKey: credentials.apiKey as string,
			modelName,
			maxTokens: options.maxTokens,
			temperature: options.temperature,
			streaming: finalStreaming,
			configuration,
			callbacks: [new N8nLlmTracing(this)],
			onFailedAttempt: makeN8nLlmFailedAttemptHandler(this),
			modelKwargs: processedKwargs,
		});

		return {
			response: model,
		};
	}
}
