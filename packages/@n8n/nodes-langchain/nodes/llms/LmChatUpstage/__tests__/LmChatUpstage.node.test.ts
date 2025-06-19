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

jest.mock('../n8nLlmFailedAttemptHandler', () => ({
	makeN8nLlmFailedAttemptHandler: jest.fn().mockReturnValue(jest.fn()),
}));

jest.mock('../N8nLlmTracing', () => ({
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
			expect(node.description.displayName).toBe('Upstage Solar Chat Model');
			expect(node.description.name).toBe('lmChatUpstage');
			expect(node.description.description).toBe('Language Model Upstage Solar');
			expect(node.description.version).toBe(1);
			expect(node.description.credentials).toEqual([
				{
					name: 'upstageApi',
					required: true,
				},
			]);
		});

		it('should have correct model options', () => {
			const modelProperty = node.description.properties.find(
				(prop) => prop.name === 'model'
			);
			
			expect(modelProperty).toBeDefined();
			expect(modelProperty?.type).toBe('options');
			expect(modelProperty?.options).toEqual([
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
			]);
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
				maxTokensToSample: 2048,
				temperature: 0.8,
				stream: true,
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
			expect(mockSupplyDataFunctions.getNodeParameter).toHaveBeenCalledWith('options', 0, {});
			
			expect(mockChatOpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					openAIApiKey: 'test-upstage-api-key',
					modelName: 'solar-pro2-preview',
					maxTokens: 2048,
					temperature: 0.8,
					streaming: true,
				}),
				expect.objectContaining({
					baseURL: 'https://api.upstage.ai/v1',
					defaultHeaders: {
						'User-Agent': 'n8n',
					},
				})
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
				.mockReturnValueOnce({});

			const mockChatOpenAIInstance = {
				call: jest.fn(),
			};
			mockChatOpenAI.mockReturnValue(mockChatOpenAIInstance as any);

			// Act
			await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(mockChatOpenAI).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					baseURL: 'https://api.upstage.ai/v1',
				})
			);
		});
	});
}); 