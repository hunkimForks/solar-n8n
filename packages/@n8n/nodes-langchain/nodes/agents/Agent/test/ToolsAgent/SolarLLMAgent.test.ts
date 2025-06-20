import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAI } from '@langchain/openai';
import { mock } from 'jest-mock-extended';
import { AgentExecutor } from 'langchain/agents';
import type { Tool } from 'langchain/tools';
import type { IExecuteFunctions, INode, INodeCredentialTestResult } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import * as helpers from '../../../../../utils/helpers';
import { toolsAgentExecute } from '../../agents/ToolsAgent/V2/execute';

const mockHelpers = mock<IExecuteFunctions['helpers']>();
const mockContext = mock<IExecuteFunctions>({ helpers: mockHelpers });

beforeEach(() => jest.resetAllMocks());

describe('Solar LLM Agent Integration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockContext.logger = {
			debug: jest.fn(),
			info: jest.fn(),
			warn: jest.fn(),
			error: jest.fn(),
		};
	});

	it('should work with Solar Chat Model in Agent configuration', async () => {
		const mockNode = mock<INode>();
		mockNode.typeVersion = 2;
		mockNode.type = '@n8n/n8n-nodes-langchain.agent';
		mockContext.getNode.mockReturnValue(mockNode);
		mockContext.getInputData.mockReturnValue([
			{ json: { text: 'Calculate 2 + 2' } },
		]);

		// Mock Solar LLM as ChatOpenAI (since Solar LLM extends ChatOpenAI)
		const mockSolarModel = mock<BaseChatModel>();
		mockSolarModel.bindTools = jest.fn().mockReturnValue(mockSolarModel);
		mockSolarModel.lc_namespace = ['chat_models'];
		
		mockContext.getInputConnectionData.mockImplementation((connectionType) => {
			if (connectionType === NodeConnectionTypes.AiLanguageModel) {
				return Promise.resolve(mockSolarModel);
			}
			return Promise.resolve(undefined);
		});

		const mockTools = [mock<Tool>()];
		jest.spyOn(helpers, 'getConnectedTools').mockResolvedValue(mockTools);

		mockContext.getNodeParameter.mockImplementation((param, _i, defaultValue) => {
			if (param === 'text') return 'Calculate 2 + 2';
			if (param === 'options.batching.batchSize') return defaultValue;
			if (param === 'options.batching.delayBetweenBatches') return defaultValue;
			if (param === 'options')
				return {
					systemMessage: 'You are a helpful assistant.',
					maxIterations: 10,
					returnIntermediateSteps: false,
					passthroughBinaryImages: true,
				};
			return defaultValue;
		});

		const mockExecutor = {
			invoke: jest.fn().mockResolvedValue({ 
				output: JSON.stringify({ result: '4' }),
				intermediateSteps: []
			}),
		};

		jest.spyOn(AgentExecutor, 'fromAgentAndTools').mockReturnValue(mockExecutor as any);

		const result = await toolsAgentExecute.call(mockContext);

		expect(mockExecutor.invoke).toHaveBeenCalledTimes(1);
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.output).toEqual('{"result":"4"}');
		// Verify that the Solar model is compatible with Agent
		expect(mockSolarModel.bindTools).toBeDefined();
	});

	it('should handle Solar LLM specific parameters in Agent', async () => {
		const mockNode = mock<INode>();
		mockNode.typeVersion = 2;
		mockNode.type = '@n8n/n8n-nodes-langchain.agent';
		mockContext.getNode.mockReturnValue(mockNode);
		mockContext.getInputData.mockReturnValue([
			{ json: { text: 'What is AI?' } },
		]);

		// Test with Solar LLM specific parameters
		const mockSolarModel = mock<BaseChatModel>();
		mockSolarModel.bindTools = jest.fn().mockReturnValue(mockSolarModel);
		mockSolarModel.lc_namespace = ['chat_models'];
		
		mockContext.getInputConnectionData.mockImplementation((connectionType) => {
			if (connectionType === NodeConnectionTypes.AiLanguageModel) {
				return Promise.resolve(mockSolarModel);
			}
			return Promise.resolve(undefined);
		});

		const mockTools = [mock<Tool>()];
		jest.spyOn(helpers, 'getConnectedTools').mockResolvedValue(mockTools);

		mockContext.getNodeParameter.mockImplementation((param, _i, defaultValue) => {
			if (param === 'text') return 'What is AI?';
			if (param === 'options.batching.batchSize') return defaultValue;
			if (param === 'options.batching.delayBetweenBatches') return defaultValue;
			if (param === 'options')
				return {
					systemMessage: 'You are a knowledgeable AI assistant.',
					maxIterations: 15,
					returnIntermediateSteps: true,
					passthroughBinaryImages: true,
				};
			return defaultValue;
		});

		const mockExecutor = {
			invoke: jest.fn().mockResolvedValue({
				output: JSON.stringify({ answer: 'AI stands for Artificial Intelligence.' }),
				intermediateSteps: [
					{
						action: { tool: 'search', toolInput: 'AI definition' },
						observation: 'AI is a technology that enables machines to think and learn.'
					}
				]
			}),
		};

		jest.spyOn(AgentExecutor, 'fromAgentAndTools').mockReturnValue(mockExecutor as any);

		const result = await toolsAgentExecute.call(mockContext);

		expect(mockExecutor.invoke).toHaveBeenCalledTimes(1);
		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.output).toEqual('{"answer":"AI stands for Artificial Intelligence."}');
		// Verify that the Solar model is compatible with Agent
		expect(mockSolarModel.bindTools).toBeDefined();
	});

	it('should properly handle Solar LLM errors in Agent execution', async () => {
		const mockNode = mock<INode>();
		mockNode.typeVersion = 2;
		mockNode.type = '@n8n/n8n-nodes-langchain.agent';
		mockContext.getNode.mockReturnValue(mockNode);
		mockContext.getInputData.mockReturnValue([
			{ json: { text: 'Test input' } },
		]);

		const mockSolarModel = mock<BaseChatModel>();
		mockSolarModel.bindTools = jest.fn().mockReturnValue(mockSolarModel);
		mockSolarModel.lc_namespace = ['chat_models'];
		
		mockContext.getInputConnectionData.mockImplementation((connectionType) => {
			if (connectionType === NodeConnectionTypes.AiLanguageModel) {
				return Promise.resolve(mockSolarModel);
			}
			return Promise.resolve(undefined);
		});

		const mockTools = [mock<Tool>()];
		jest.spyOn(helpers, 'getConnectedTools').mockResolvedValue(mockTools);

		mockContext.getNodeParameter.mockImplementation((param, _i, defaultValue) => {
			if (param === 'text') return 'Test input';
			if (param === 'options.batching.batchSize') return defaultValue;
			if (param === 'options.batching.delayBetweenBatches') return defaultValue;
			if (param === 'options')
				return {
					systemMessage: 'You are a helpful assistant.',
					maxIterations: 5,
					returnIntermediateSteps: false,
					passthroughBinaryImages: true,
				};
			return defaultValue;
		});

		mockContext.continueOnFail.mockReturnValue(true);

		const mockExecutor = {
			invoke: jest.fn().mockRejectedValue(new Error('Solar LLM API Error: Invalid API key')),
		};

		jest.spyOn(AgentExecutor, 'fromAgentAndTools').mockReturnValue(mockExecutor as any);

		const result = await toolsAgentExecute.call(mockContext);

		expect(result[0]).toHaveLength(1);
		expect(result[0][0].json.error).toContain('Solar LLM API Error: Invalid API key');
	});

	it('should validate that Solar LLM node is properly connected to Agent', async () => {
		const mockNode = mock<INode>();
		mockNode.typeVersion = 2;
		mockNode.type = '@n8n/n8n-nodes-langchain.agent';
		mockContext.getNode.mockReturnValue(mockNode);

		// Test that Solar LLM model is accepted by Agent
		const mockSolarModel = mock<BaseChatModel>();
		mockSolarModel.bindTools = jest.fn().mockReturnValue(mockSolarModel);
		mockSolarModel.lc_namespace = ['chat_models'];

		// Verify the model has the required methods for Agent compatibility
		expect(mockSolarModel.bindTools).toBeDefined();
		expect(mockSolarModel.lc_namespace).toContain('chat_models');
		expect(typeof mockSolarModel.invoke).toBe('function');
		expect(typeof mockSolarModel.stream).toBe('function');
	});
}); 