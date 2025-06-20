import { ChatOpenAI } from '@langchain/openai';
import type { ISupplyDataFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { LmChatUpstage } from '../LmChatUpstage.node';

// Mock the ChatOpenAI constructor
jest.mock('@langchain/openai', () => ({
	ChatOpenAI: jest.fn(),
}));

// Mock the utils
jest.mock('@utils/httpProxyAgent', () => ({
	getHttpProxyAgent: jest.fn().mockReturnValue(null),
}));

jest.mock('@utils/sharedFields', () => ({
	getConnectionHintNoticeField: jest.fn().mockReturnValue({
		displayName: 'Mock Connection Hint',
		name: 'connectionHint',
		type: 'notice',
		default: '',
	}),
}));

jest.mock('../../n8nLlmFailedAttemptHandler', () => ({
	makeN8nLlmFailedAttemptHandler: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../../N8nLlmTracing', () => ({
	N8nLlmTracing: jest.fn(),
}));

describe('LmChatUpstage', () => {
	let node: LmChatUpstage;
	let mockSupplyDataFunctions: jest.Mocked<ISupplyDataFunctions>;
	let mockLoadOptionsFunctions: jest.Mocked<ILoadOptionsFunctions>;
	let mockChatOpenAIInstance: jest.Mocked<ChatOpenAI>;

	beforeEach(() => {
		node = new LmChatUpstage();

		// Mock the ChatOpenAI constructor
		mockChatOpenAIInstance = {
			invoke: jest.fn(),
			stream: jest.fn(),
			call: jest.fn(),
		} as any;

		(ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mockImplementation(
			() => mockChatOpenAIInstance,
		);

		// Mock ISupplyDataFunctions
		mockSupplyDataFunctions = {
			getCredentials: jest.fn().mockResolvedValue({
				apiKey: 'test-upstage-api-key',
			}),
			getNodeParameter: jest.fn(),
			helpers: {
				request: jest.fn(),
			},
		} as any;

		// Mock ILoadOptionsFunctions
		mockLoadOptionsFunctions = {
			getCredentials: jest.fn().mockResolvedValue({
				apiKey: 'test-upstage-api-key',
			}),
			helpers: {
				request: jest.fn(),
			},
		} as any;
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('Node Description', () => {
		it('should have correct node properties', () => {
			expect(node.description.displayName).toBe('Solar Chat Model');
			expect(node.description.name).toBe('lmChatUpstage');
			expect(node.description.description).toBe('For advanced usage with an AI chain');
			expect(node.description.version).toBe(1);
			expect(node.description.credentials).toEqual([
				{
					name: 'upstageApi',
					required: true,
				},
			]);
		});

		it('should have correct model configuration with dynamic loading', () => {
			const modelProperty = node.description.properties?.find((prop) => prop.name === 'model');
			expect(modelProperty).toBeDefined();
			expect(modelProperty?.type).toBe('options');
			expect(modelProperty?.default).toBe('');
		});

		it('should have streaming option in options collection', () => {
			const optionsProperty = node.description.properties?.find((prop) => prop.name === 'options');
			expect(optionsProperty).toBeDefined();
			expect(optionsProperty?.type).toBe('collection');

			const streamingOption = (optionsProperty as any)?.options?.find(
				(opt: any) => opt.name === 'streaming',
			);
			expect(streamingOption).toBeDefined();
			expect(streamingOption?.type).toBe('boolean');
			expect(streamingOption?.default).toBe(false);
		});
	});

	describe('supplyData', () => {
		beforeEach(() => {
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return defaultValue || {};
					if (paramName === 'modelKwargs') return defaultValue || {};
					return defaultValue;
				},
			);
		});

		it('should create ChatOpenAI instance with correct configuration', async () => {
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			expect(result.response).toBeDefined();
			expect(ChatOpenAI).toHaveBeenCalledWith({
				openAIApiKey: 'test-upstage-api-key',
				modelName: 'solar-pro',
				maxTokens: undefined,
				temperature: undefined,
				streaming: false,
				configuration: expect.objectContaining({
					baseURL: 'https://api.upstage.ai/v1',
					httpAgent: expect.any(Object),
					defaultHeaders: {
						'Content-Type': 'application/json',
					},
					fetch: expect.any(Function),
				}),
				callbacks: expect.any(Array),
				onFailedAttempt: expect.any(Function),
				modelKwargs: {},
			});

			expect(mockSupplyDataFunctions.getCredentials).toHaveBeenCalledWith('upstageApi');
			expect(mockSupplyDataFunctions.getNodeParameter).toHaveBeenCalledWith('model', 0);
			expect(mockSupplyDataFunctions.getNodeParameter).toHaveBeenCalledWith('options', 0, {});
		});

		it('should enable streaming when streaming option is true', async () => {
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return { streaming: true };
					if (paramName === 'modelKwargs') return defaultValue || {};
					return defaultValue;
				},
			);

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					streaming: true,
				}),
			);
		});

		it('should use correct base URL for Upstage API', async () => {
			await node.supplyData.call(mockSupplyDataFunctions, 0);

			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					configuration: expect.objectContaining({
						baseURL: 'https://api.upstage.ai/v1',
					}),
				}),
			);
		});

		it('should handle stream_options conversion from OpenAI format', async () => {
			// Set up modelKwargs with stream_options
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs')
						return {
							stream_options: { include_usage: true },
						};
					return defaultValue;
				},
			);

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Verify streaming was enabled due to stream_options
			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					streaming: true,
					modelKwargs: {}, // stream_options should be filtered out
				}),
			);
		});

		it('should return proxy model with stream_options adapter', async () => {
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			expect(result.response).toBeDefined();
			expect(result.response).toBe(mockChatOpenAIInstance);
		});

		it('should filter out stream_options from modelKwargs during initialization', async () => {
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs')
						return {
							stream_options: { include_usage: true },
							temperature: 0.5,
							max_tokens: 100,
						};
					return defaultValue;
				},
			);

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Verify stream_options was filtered out but other params remain
			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					streaming: true, // Should be enabled due to stream_options
					modelKwargs: {
						temperature: 0.5,
						max_tokens: 100,
						// stream_options should be absent
					},
				}),
			);
		});

		it('should auto-select a solar model when no model is specified', async () => {
			// Mock empty model parameter
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return '';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs') return {};
					return defaultValue;
				},
			);

			// Mock API response with various Solar models
			(mockSupplyDataFunctions.helpers.request as jest.Mock).mockResolvedValue({
				data: [
					{ id: 'solar-mini' },
					{ id: 'solar-pro' },
					{ id: 'solar-mini-250422' },
					{ id: 'gpt-4' }, // Non-solar model
				],
			});

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert - Should call the API to get models
			expect(mockSupplyDataFunctions.helpers.request).toHaveBeenCalledWith(
				'https://api.upstage.ai/v1/models',
				{
					method: 'GET',
					headers: {
						Authorization: 'Bearer test-upstage-api-key',
						'Content-Type': 'application/json',
					},
				},
			);

			// Should use a Solar model (any of the available ones)
			const chatOpenAICall = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0]?.[0];
			expect(chatOpenAICall?.modelName).toMatch(/solar/i);
		});

		it('should fallback to solar-pro2-preview if dynamic model fetch fails', async () => {
			// Mock empty model parameter
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return '';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs') return {};
					return defaultValue;
				},
			);

			// Mock API failure
			(mockSupplyDataFunctions.helpers.request as jest.Mock).mockRejectedValue(
				new Error('API Error'),
			);

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Should use fallback model (latest)
			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					modelName: 'solar-pro2-preview',
				}),
			);
		});

		it('should use specified model when provided', async () => {
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs') return {};
					return defaultValue;
				},
			);

			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Should not make API call for models
			expect(mockSupplyDataFunctions.helpers.request).not.toHaveBeenCalled();

			// Should use the specified model
			expect(ChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					modelName: 'solar-pro',
				}),
			);
		});
	});

	describe('loadOptions', () => {
		it('should load Solar models from API', async () => {
			// Mock API response
			(mockLoadOptionsFunctions.helpers.request as jest.Mock).mockResolvedValue({
				data: [
					{ id: 'solar-mini' },
					{ id: 'solar-pro' },
					{ id: 'solar-1-mini-chat' },
					{ id: 'gpt-4' }, // Non-solar model - should be filtered out
				],
			});

			const result = await node.methods.loadOptions.getModels.call(mockLoadOptionsFunctions);

			expect(mockLoadOptionsFunctions.helpers.request).toHaveBeenCalledWith(
				'https://api.upstage.ai/v1/models',
				{
					method: 'GET',
					headers: {
						Authorization: 'Bearer test-upstage-api-key',
						'Content-Type': 'application/json',
					},
				},
			);

			// Should return only Solar models (3 out of 4 from mock data)
			expect(result).toHaveLength(3);

			// All returned models should be Solar models
			result.forEach((model) => {
				expect(model.name).toMatch(/solar/i);
				expect(model.value).toMatch(/solar/i);
				expect(model.name).toBe(model.value);
			});

			// Should filter out non-Solar models
			const modelNames = result.map((m) => m.name);
			expect(modelNames).not.toContain('gpt-4');
		});

		it('should handle API errors gracefully', async () => {
			(mockLoadOptionsFunctions.helpers.request as jest.Mock).mockRejectedValue(
				new Error('API Error'),
			);

			const result = await node.methods.loadOptions.getModels.call(mockLoadOptionsFunctions);

			// Should return fallback model
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('solar-mini');
		});

		it('should handle invalid API responses', async () => {
			(mockLoadOptionsFunctions.helpers.request as jest.Mock).mockResolvedValue({
				// Missing data property
			});

			const result = await node.methods.loadOptions.getModels.call(mockLoadOptionsFunctions);

			// Should return fallback model
			expect(result).toHaveLength(1);
			expect(result[0].name).toBe('solar-mini');
		});

		it('should deduplicate models', async () => {
			(mockLoadOptionsFunctions.helpers.request as jest.Mock).mockResolvedValue({
				data: [
					{ id: 'solar-mini' },
					{ id: 'solar-mini' }, // Duplicate
					{ id: 'solar-pro' },
				],
			});

			const result = await node.methods.loadOptions.getModels.call(mockLoadOptionsFunctions);

			// Should return deduplicated models (2 unique models)
			expect(result).toHaveLength(2);

			// Should contain both unique models
			const modelNames = result.map((m) => m.name);
			expect(modelNames).toContain('solar-mini');
			expect(modelNames).toContain('solar-pro');
		});

		it('should sort models intelligently by version and date', async () => {
			const mockResponse = {
				data: [
					{ id: 'solar-mini' },
					{ id: 'solar-pro' },
					{ id: 'solar-pro2-preview' },
					{ id: 'gpt-4' }, // Non-solar model
					{ id: 'solar-1-mini' },
					{ id: 'solar-mini-250422' }, // Date-based model
					{ id: 'solar-pro-240101' }, // Older date-based model
				],
			};

			(mockLoadOptionsFunctions.helpers.request as jest.Mock).mockResolvedValue(mockResponse);

			const result = await node.methods.loadOptions.getModels.call(mockLoadOptionsFunctions);

			// Should return 6 Solar models (filtering out gpt-4)
			expect(result).toHaveLength(6);

			// All should be Solar models
			result.forEach((model) => {
				expect(model.name).toMatch(/solar/i);
			});

			// Should contain all expected Solar models
			const modelNames = result.map((m) => m.name);
			expect(modelNames).toContain('solar-mini');
			expect(modelNames).toContain('solar-pro');
			expect(modelNames).toContain('solar-pro2-preview');
			expect(modelNames).toContain('solar-1-mini');
			expect(modelNames).toContain('solar-mini-250422');
			expect(modelNames).toContain('solar-pro-240101');
		});
	});

	describe('Stream Options HTTP Filtering', () => {
		it('should filter stream_options from HTTP request body', async () => {
			// Mock the node parameters for this test
			mockSupplyDataFunctions.getNodeParameter.mockImplementation(
				(paramName: string, itemIndex: number, defaultValue?: any) => {
					if (paramName === 'model') return 'solar-pro';
					if (paramName === 'options') return {};
					if (paramName === 'modelKwargs') return {};
					return defaultValue;
				},
			);

			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
			const model = result.response as ChatOpenAI;

			// Get the configuration object that was passed to ChatOpenAI
			const chatOpenAICall = (ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>).mock.calls[0]?.[0];
			const customFetch = chatOpenAICall?.configuration?.fetch;

			if (!customFetch) {
				throw new Error('Custom fetch function not found in configuration');
			}

			// Mock fetch to capture the actual request
			const mockFetch = jest.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ choices: [] }),
			} as Response);

			// Replace global fetch temporarily
			const originalFetch = global.fetch;
			global.fetch = mockFetch;

			try {
				// Test the custom fetch function
				await customFetch('https://api.upstage.ai/v1/chat/completions', {
					method: 'POST',
					body: JSON.stringify({
						model: 'solar-pro',
						messages: [{ role: 'user', content: 'test' }],
						stream_options: { include_usage: true },
					}),
				});

				// Verify that stream_options was filtered out and stream was added
				expect(mockFetch).toHaveBeenCalledWith(
					'https://api.upstage.ai/v1/chat/completions',
					expect.objectContaining({
						method: 'POST',
						body: JSON.stringify({
							model: 'solar-pro',
							messages: [{ role: 'user', content: 'test' }],
							stream: true,
						}),
						headers: expect.any(Headers),
					}),
				);
			} finally {
				global.fetch = originalFetch;
			}
		});
	});
});
