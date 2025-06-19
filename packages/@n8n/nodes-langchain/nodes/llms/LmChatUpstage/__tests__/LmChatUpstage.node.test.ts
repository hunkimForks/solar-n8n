import { mock } from 'jest-mock-extended';
import type { ISupplyDataFunctions, INode } from 'n8n-workflow';
import { ChatOpenAI } from '@langchain/openai';

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
	let mockChatOpenAI: jest.MockedClass<typeof ChatOpenAI>;

	beforeEach(() => {
		node = new LmChatUpstage();
		mockChatOpenAI = ChatOpenAI as jest.MockedClass<typeof ChatOpenAI>;

		// Mock ISupplyDataFunctions
		mockSupplyDataFunctions = mock<ISupplyDataFunctions>({
			getCredentials: jest.fn(),
			getNodeParameter: jest.fn(),
			getNode: jest.fn().mockReturnValue({
				id: 'test-node-id',
				name: 'Test Upstage Node',
				type: 'lmChatUpstage',
			} as INode),
		});
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
			const modelProperty = node.description.properties.find((prop) => prop.name === 'model');

			expect(modelProperty).toBeDefined();
			expect(modelProperty?.type).toBe('options');
			expect(modelProperty?.typeOptions?.loadOptions).toBeDefined();
			expect(modelProperty?.typeOptions?.loadOptions?.routing?.request?.method).toBe('GET');
			expect(modelProperty?.typeOptions?.loadOptions?.routing?.request?.url).toBe('/models');
			expect(modelProperty?.default).toBe('solar-pro2-preview');
		});
	});

	describe('supplyData', () => {
		it('should create ChatOpenAI instance with correct configuration', async () => {
			// Arrange
			const mockCredentials = {
				apiKey: 'test-upstage-api-key',
			};
			const mockModel = 'solar-pro2-preview';
			const mockOptions = {
				maxTokens: 2048,
				temperature: 0.8,
				reasoningEffort: 'high',
			};

			mockSupplyDataFunctions.getCredentials.mockResolvedValue(mockCredentials);
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce(mockModel)
				.mockReturnValueOnce(mockOptions);

			const mockChatOpenAIInstance = {
				call: jest.fn(),
			};
			mockChatOpenAI.mockReturnValue(mockChatOpenAIInstance as any);

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(mockSupplyDataFunctions.getCredentials).toHaveBeenCalledWith('upstageApi');
			expect(mockSupplyDataFunctions.getNodeParameter).toHaveBeenCalledWith('model', 0);
			expect(mockSupplyDataFunctions.getNodeParameter).toHaveBeenCalledWith('options', 0, {
				maxTokens: 4096,
				temperature: 0.7,
				reasoningEffort: 'medium',
			});

			expect(mockChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					openAIApiKey: 'test-upstage-api-key',
					modelName: 'solar-pro2-preview',
					maxTokens: 2048,
					temperature: 0.8,
					streaming: false,
					configuration: expect.objectContaining({
						baseURL: 'https://api.upstage.ai/v1',
					}),
					modelKwargs: expect.objectContaining({
						reasoning_effort: 'high',
					}),
				}),
			);

			expect(result.response).toBe(mockChatOpenAIInstance);
		});

		it('should use correct base URL for Upstage API', async () => {
			// Arrange
			const mockCredentials = {
				apiKey: 'test-upstage-api-key',
			};

			mockSupplyDataFunctions.getCredentials.mockResolvedValue(mockCredentials);
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-pro')
				.mockReturnValueOnce({
					maxTokens: 4096,
					temperature: 0.7,
					reasoningEffort: 'medium',
				});

			const mockChatOpenAIInstance = {
				call: jest.fn(),
			};
			mockChatOpenAI.mockReturnValue(mockChatOpenAIInstance as any);

			// Act
			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(mockChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					configuration: expect.objectContaining({
						baseURL: 'https://api.upstage.ai/v1',
					}),
				}),
			);
		});
	});
});
