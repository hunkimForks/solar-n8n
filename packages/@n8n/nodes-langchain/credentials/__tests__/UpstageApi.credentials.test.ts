import type { ICredentialTestRequest } from 'n8n-workflow';
import { UpstageApi } from '../UpstageApi.credentials';

describe('UpstageApi Credentials', () => {
	let credentials: UpstageApi;

	beforeEach(() => {
		credentials = new UpstageApi();
	});

	describe('Credential Definition', () => {
		it('should have correct credential properties', () => {
			expect(credentials.name).toBe('upstageApi');
			expect(credentials.displayName).toBe('Upstage');
			expect(credentials.documentationUrl).toBe(
				'https://console.upstage.ai/docs/capabilities/chat',
			);
		});

		it('should have API key property with correct configuration', () => {
			expect(credentials.properties).toHaveLength(1);

			const apiKeyProperty = credentials.properties[0];
			expect(apiKeyProperty.displayName).toBe('API Key');
			expect(apiKeyProperty.name).toBe('apiKey');
			expect(apiKeyProperty.type).toBe('string');
			expect(apiKeyProperty.typeOptions?.password).toBe(true);
			expect(apiKeyProperty.required).toBe(true);
			expect(apiKeyProperty.default).toBe('');
			expect(apiKeyProperty.description).toBe('Your Upstage API key');
		});
	});

	describe('Authentication Configuration', () => {
		it('should have correct authentication type', () => {
			expect(credentials.authenticate.type).toBe('generic');
		});

		it('should have correct authentication headers', () => {
			const authProperties = credentials.authenticate.properties;
			expect(authProperties.headers).toEqual({
				Authorization: '=Bearer {{$credentials.apiKey}}',
				'Content-Type': 'application/json',
			});
		});

		it('should use Bearer token authentication', () => {
			const authHeaders = credentials.authenticate.properties.headers;
			expect(authHeaders.Authorization).toBe('=Bearer {{$credentials.apiKey}}');
		});

		it('should include Content-Type header', () => {
			const authHeaders = credentials.authenticate.properties.headers;
			expect(authHeaders['Content-Type']).toBe('application/json');
		});
	});

	describe('Test Configuration', () => {
		it('should have correct test request configuration', () => {
			const testRequest: ICredentialTestRequest = credentials.test;

			expect(testRequest.request.baseURL).toBe('https://api.upstage.ai/v1');
			expect(testRequest.request.url).toBe('/models');
		});

		it('should test against the correct endpoint', () => {
			expect(credentials.test.request.url).toBe('/models');
		});

		it('should use correct base URL for testing', () => {
			expect(credentials.test.request.baseURL).toBe('https://api.upstage.ai/v1');
		});
	});

	describe('Integration Tests', () => {
		it('should be compatible with n8n credential system', () => {
			// Test that the credential follows n8n patterns
			expect(typeof credentials.name).toBe('string');
			expect(typeof credentials.displayName).toBe('string');
			expect(Array.isArray(credentials.properties)).toBe(true);
			expect(typeof credentials.authenticate).toBe('object');
			expect(typeof credentials.test).toBe('object');
		});

		it('should have required properties for API key credential', () => {
			const apiKeyProperty = credentials.properties.find((prop) => prop.name === 'apiKey');
			expect(apiKeyProperty).toBeDefined();
			expect(apiKeyProperty?.required).toBe(true);
			expect(apiKeyProperty?.type).toBe('string');
			expect(apiKeyProperty?.typeOptions?.password).toBe(true);
		});

		it('should have valid authentication configuration', () => {
			const auth = credentials.authenticate;
			expect(auth.type).toBe('generic');
			expect(auth.properties).toBeDefined();
			expect(auth.properties.headers).toBeDefined();
			expect(auth.properties.headers.Authorization).toContain('Bearer');
			expect(auth.properties.headers.Authorization).toContain('{{$credentials.apiKey}}');
		});

		it('should have valid test configuration', () => {
			const test = credentials.test;
			expect(test.request).toBeDefined();
			expect(test.request.baseURL).toBeDefined();
			expect(test.request.url).toBeDefined();
			expect(test.request.baseURL).toMatch(/^https:\/\//);
		});
	});

	describe('Security', () => {
		it('should mark API key field as password type', () => {
			const apiKeyProperty = credentials.properties[0];
			expect(apiKeyProperty.typeOptions?.password).toBe(true);
		});

		it('should not expose API key in plain text by default', () => {
			const apiKeyProperty = credentials.properties[0];
			expect(apiKeyProperty.default).toBe('');
			expect(apiKeyProperty.typeOptions?.password).toBe(true);
		});

		it('should use secure authentication header format', () => {
			const authHeader = credentials.authenticate.properties.headers.Authorization;
			expect(authHeader).toBe('=Bearer {{$credentials.apiKey}}');
			expect(authHeader).toContain('Bearer');
			expect(authHeader).toContain('{{$credentials.apiKey}}');
		});
	});

	describe('API Compatibility', () => {
		it('should target Upstage API v1 endpoint', () => {
			expect(credentials.test.request.baseURL).toBe('https://api.upstage.ai/v1');
		});

		it('should test models endpoint for credential validation', () => {
			expect(credentials.test.request.url).toBe('/models');
		});

		it('should be compatible with Solar LLM requirements', () => {
			// Verify that the credential structure supports Solar LLM usage
			expect(credentials.name).toBe('upstageApi');
			expect(credentials.authenticate.properties.headers.Authorization).toContain('Bearer');
			expect(credentials.test.request.baseURL).toBe('https://api.upstage.ai/v1');
		});
	});
});
