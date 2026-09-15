import 'dotenv/config';
import swaggerJsdoc from 'swagger-jsdoc';
import { default as SecretManager } from '@/shared-libs/utils/secret-manager.util';
import {
  SWAGGER_CONFIG,
  CORS_HEADERS,
  CORS_RESPONSE_PARAMETERS,
  MOCK_CORS_RESPONSE_PARAMETERS,
  DEFAULT_ERROR_RESPONSES,
  SWAGGER_API_PATHS,
} from '@/shared-libs/constants';
import fs from 'fs';
import path from 'path';

// Types
interface SwaggerPath {
  [method: string]: any;
  options?: any;
  parameters?: Array<{
    name: string;
    in: string;
    required: boolean;
    schema: { type: string };
  }>;
}

interface SwaggerIntegration {
  tags?: string[];
  responses?: Record<string, any>;
  [key: string]: any;
}

// Utility functions
async function initializeSecrets(): Promise<void> {
  const vaultPath = process.env.VAULT_PATH;
  if (!vaultPath) {
    throw new Error('VAULT_PATH environment variable is not set');
  }

  try {
    await SecretManager.getSecret(vaultPath);
  } catch (error) {
    console.error('Error fetching secrets from Vault:', error);
    process.exit(1);
  }
}

function createSwaggerOptions(): swaggerJsdoc.Options {
  return {
    definition: {
      openapi: SWAGGER_CONFIG.OPENAPI_VERSION,
      info: {
        title: `WMS Web API Service Order Documentation - ${SecretManager.env.NODE_ENV}`,
        version: SWAGGER_CONFIG.API_VERSION,
      },
      servers: [{ url: SecretManager.env.BASE_URL }],
      'x-amazon-apigateway-binary-media-types': ['multipart/form-data'],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          api_key: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
          },
        },
      },
    },
    apis: [...SWAGGER_API_PATHS],
  };
}

function createOptionsMethod() {
  return {
    responses: {
      '200': {
        description: '200 response',
        headers: CORS_HEADERS,
      },
    },
    'x-amazon-apigateway-integration': {
      responses: {
        default: {
          statusCode: '200',
          responseParameters: CORS_RESPONSE_PARAMETERS,
        },
      },
      requestTemplates: {
        'application/json': '{"statusCode": 200}',
      },
      passthroughBehavior: 'when_no_match',
      type: 'mock',
    },
  };
}

function extractPathParameters(path: string): string[] {
  return [...path.matchAll(/{([a-zA-Z_]\w{0,49})}/g)].map((match) => match[1]);
}

function createPathParameters(pathParams: string[]) {
  return pathParams.map((param) => ({
    name: param,
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
  }));
}

function addCorsHeaders(integration: SwaggerIntegration): void {
  if (!integration.responses) return;

  Object.values(integration.responses).forEach((response: any) => {
    if (response && !response.headers) {
      response.headers = { ...CORS_HEADERS };
    }
  });
}

function isErrorStatusCode(
  statusCode: string,
): statusCode is keyof typeof DEFAULT_ERROR_RESPONSES {
  return statusCode in DEFAULT_ERROR_RESPONSES;
}

function createMockIntegrationResponse(
  statusCode: string,
  integration: SwaggerIntegration,
) {
  const example =
    integration.responses?.[statusCode]?.content?.['application/json']?.example;

  let defaultResponse = {};
  if (statusCode === '200') {
    defaultResponse = { message: 'No example response defined' };
  } else if (isErrorStatusCode(statusCode)) {
    defaultResponse = DEFAULT_ERROR_RESPONSES[statusCode];
  }

  return {
    statusCode,
    ...(statusCode !== '200' && { selectionPattern: statusCode }),
    responseTemplates: {
      'application/json': JSON.stringify(example || defaultResponse),
    },
    responseParameters: MOCK_CORS_RESPONSE_PARAMETERS,
  };
}

function createMockIntegration(
  method: string,
  path: string,
  integration: SwaggerIntegration,
) {
  return {
    responses: {
      default: createMockIntegrationResponse('200', integration),
      '401': createMockIntegrationResponse('401', integration),
      '500': createMockIntegrationResponse('500', integration),
    },
    requestTemplates: {
      'application/json': `
        #set($responseCode = $input.params('x-mock-response-code'))
        {
          "statusCode": #if($responseCode != "") $responseCode #else 200 #end,
          "headers": {
            "Authorization": "$input.params('Authorization')",
            "x-api-key": "$input.params('x-api-key')",
            "Content-Type": "$input.params('Content-Type')"
          }
        }`,
    },
    httpMethod: method,
    uri: `${SecretManager.env.BASE_URL}${path}`,
    passthroughBehavior: 'when_no_match',
    type: 'mock',
  };
}

function createHttpProxyIntegration(
  method: string,
  path: string,
  pathParams: string[],
) {
  return {
    httpMethod: method,
    uri: `${SecretManager.env.BASE_URL}${path}`,
    connectionType: 'VPC_LINK',
    connectionId:
      SecretManager.env.NODE_ENV !== 'Production'
        ? SWAGGER_CONFIG.VPC_LINK_CONNECTION_ID
        : SWAGGER_CONFIG.VPC_LINK_CONNECTION_ID_PRODUCTION,
    passthroughBehavior: 'when_no_match',
    type: 'http_proxy',
    ...(pathParams.length > 0 && {
      requestParameters: Object.fromEntries(
        pathParams.map((param) => [
          `integration.request.path.${param}`,
          `method.request.path.${param}`,
        ]),
      ),
    }),
  };
}

function processEndpointMethod(
  method: string,
  integration: SwaggerIntegration,
  path: string,
  pathParams: string[],
): void {
  if (method === 'options') return;

  const isMockEndpoint = integration.tags?.includes('Mock');

  if (isMockEndpoint) {
    addCorsHeaders(integration);
    integration['x-amazon-apigateway-integration'] = createMockIntegration(
      method,
      path,
      integration,
    );
  } else {
    integration['x-amazon-apigateway-integration'] = createHttpProxyIntegration(
      method,
      path,
      pathParams,
    );
  }
}

function processSwaggerPaths(swaggerDocs: any): void {
  const optionsMethod = createOptionsMethod();

  Object.entries(swaggerDocs.paths).forEach(
    ([path, endpoint]: [string, SwaggerPath]) => {
      endpoint.options = optionsMethod;

      const pathParams = extractPathParameters(path);
      if (pathParams.length > 0) {
        endpoint.parameters = createPathParameters(pathParams);
      }

      Object.entries(endpoint).forEach(([method, integration]) => {
        if (typeof integration === 'object' && integration !== null) {
          processEndpointMethod(
            method,
            integration as SwaggerIntegration,
            path,
            pathParams,
          );
        }
      });
    },
  );
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeSwaggerFile(swaggerDocs: any): void {
  const publicDir = path.join(__dirname, '../public');
  ensureDirectoryExists(publicDir);

  const swaggerFilePath = path.join(__dirname, '../../swagger.json');
  fs.writeFileSync(swaggerFilePath, JSON.stringify(swaggerDocs, null, 2));
}

async function swaggerBuild(): Promise<void> {
  try {
    await initializeSecrets();

    const options = createSwaggerOptions();
    const swaggerDocs = swaggerJsdoc(options);

    processSwaggerPaths(swaggerDocs);
    writeSwaggerFile(swaggerDocs);

    console.log('Swagger documentation generated successfully');
  } catch (error) {
    console.error('Error building swagger documentation:', error);
    throw error;
  }
}

swaggerBuild();
