/**
 * Integration tests for Upstage Solar LLM
 * These tests require a real API key and will be skipped if not provided
 * Set UPSTAGE_API_KEY environment variable to run these tests
 */

import { LmChatUpstage } from '../LmChatUpstage.node';
import type { ISupplyDataFunctions, INode } from 'n8n-workflow';
import { mock } from 'jest-mock-extended';

const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;

// Skip integration tests if no API key is provided
const describeIfApiKey = UPSTAGE_API_KEY ? describe : describe.skip;

describeIfApiKey('LmChatUpstage Integration Tests', () => {
	let node: LmChatUpstage;
	let mockSupplyDataFunctions: jest.Mocked<ISupplyDataFunctions>;

	beforeEach(() => {
		node = new LmChatUpstage();
		
		mockSupplyDataFunctions = mock<ISupplyDataFunctions>({
			getCredentials: jest.fn().mockResolvedValue({
				apiKey: UPSTAGE_API_KEY,
			}),
			getNodeParameter: jest.fn(),
			getNode: jest.fn().mockReturnValue({
				id: 'test-integration-node',
				name: 'Test Integration Upstage Node',
				type: 'lmChatUpstage',
			} as INode),
		});
	});

	describe('Real API Integration', () => {
		it('should successfully create a Solar LLM instance with solar-mini model', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 100,
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(result.response).toBeDefined();
			expect(result.response.modelName).toBe('solar-mini');
		}, 10000); // 10 second timeout for API calls

		it('should successfully create a Solar LLM instance with solar-pro model', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-pro')
				.mockReturnValueOnce({
					temperature: 0.5,
					maxTokensToSample: 200,
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(result.response).toBeDefined();
			expect(result.response.modelName).toBe('solar-pro');
		}, 10000);

		it('should successfully create a Solar LLM instance with solar-pro2-preview model', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-pro2-preview')
				.mockReturnValueOnce({
					temperature: 0.7,
					maxTokensToSample: 500,
					reasoningEffort: 'high',
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert
			expect(result.response).toBeDefined();
			expect(result.response.modelName).toBe('solar-pro2-preview');
		}, 15000); // Longer timeout for more complex model

		it('should handle simple text generation with solar-mini', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 50,
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
			
			// Test actual LLM call
			const response = await result.response.invoke([
				{ role: 'user', content: 'Say "Hello Solar!" and nothing else.' }
			]);

			// Assert
			expect(response).toBeDefined();
			expect(response.content).toBeDefined();
			expect(typeof response.content).toBe('string');
			expect(response.content.toLowerCase()).toContain('hello');
		}, 15000);

		it('should handle reasoning tasks with solar-pro2-preview', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-pro2-preview')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 100,
					reasoningEffort: 'high',
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
			
			// Test actual LLM call with a reasoning task
			const response = await result.response.invoke([
				{ 
					role: 'user', 
					content: 'What is 15 + 27? Provide only the number as your answer.' 
				}
			]);

			// Assert
			expect(response).toBeDefined();
			expect(response.content).toBeDefined();
			expect(response.content.toString()).toContain('42');
		}, 20000);

		it('should handle streaming response', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 50,
					stream: true,
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
			
			// Test streaming
			let streamedContent = '';
			const stream = await result.response.stream([
				{ role: 'user', content: 'Count from 1 to 3 and say done.' }
			]);

			for await (const chunk of stream) {
				streamedContent += chunk.content;
			}

			// Assert
			expect(streamedContent).toBeDefined();
			expect(streamedContent.length).toBeGreaterThan(0);
		}, 15000);
	});

	describe('Error Handling with Real API', () => {
		it('should handle invalid API key gracefully', async () => {
			// Arrange - Use invalid API key
			mockSupplyDataFunctions.getCredentials.mockResolvedValue({
				apiKey: 'invalid-key-12345',
			});
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert - Should create instance but fail on actual call
			expect(result.response).toBeDefined();
			
			// Test that API call fails with invalid key
			await expect(
				result.response.invoke([{ role: 'user', content: 'Hello' }])
			).rejects.toThrow();
		}, 10000);

		it('should handle very large token requests appropriately', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 100000, // Very large number
				});

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);

			// Assert - Should create instance even with large token count
			expect(result.response).toBeDefined();
			expect(result.response.maxTokens).toBe(100000);
		});
	});

	describe('Performance Tests', () => {
		it('should respond within reasonable time for simple queries', async () => {
			// Arrange
			mockSupplyDataFunctions.getNodeParameter
				.mockReturnValueOnce('solar-mini')
				.mockReturnValueOnce({
					temperature: 0.1,
					maxTokensToSample: 20,
				});

			const startTime = Date.now();

			// Act
			const result = await node.supplyData.call(mockSupplyDataFunctions, 0);
			const response = await result.response.invoke([
				{ role: 'user', content: 'Hi' }
			]);

			const endTime = Date.now();
			const duration = endTime - startTime;

			// Assert - Should respond within 10 seconds for simple query
			expect(response).toBeDefined();
			expect(duration).toBeLessThan(10000);
		}, 12000);
	});
});

// Always run basic functionality tests
describe('LmChatUpstage Basic Functionality', () => {
	it('should show helpful message when API key is not provided', () => {
		if (!UPSTAGE_API_KEY) {
			console.log('ℹ️  Integration tests skipped - set UPSTAGE_API_KEY environment variable to run them');
			console.log('   Example: UPSTAGE_API_KEY=up_your_key_here npm test');
		}
		expect(true).toBe(true); // Always pass this test
	});

	it('should have all required Solar models defined', () => {
		const node = new LmChatUpstage();
		const modelProperty = node.description.properties.find(prop => prop.name === 'model');
		const models = modelProperty?.options?.map(opt => opt.value) || [];
		
		expect(models).toContain('solar-pro2-preview');
		expect(models).toContain('solar-pro');
		expect(models).toContain('solar-mini');
	});
}); 