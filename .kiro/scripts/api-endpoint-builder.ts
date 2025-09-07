import * as fs from 'fs';
import * as path from 'path';

interface ApiEndpoint {
  method: string;
  path: string;
  resourceName: string;
  handlerName: string;
  description: string;
  parameters?: {
    path?: string[];
    query?: string[];
    headers?: string[];
  };
  requestBody?: {
    required: boolean;
    schema: any;
  };
  responses: {
    [statusCode: string]: {
      description: string;
      schema?: any;
    };
  };
  authentication?: string;
  permissions?: string[];
}

interface ValidationSchema {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * API Endpoint Builder
 * Analyzes API Gateway configurations and generates corresponding Lambda handlers,
 * validation schemas, and OpenAPI documentation
 */
export class ApiEndpointBuilder {
  private readonly infrastructurePath: string;
  private readonly lambdaPath: string;
  private readonly docsPath: string;

  constructor(basePath: string = 'GRACE-1-recovered') {
    this.infrastructurePath = path.join(basePath, 'infrastructure');
    this.lambdaPath = path.join(this.infrastructurePath, 'lambda');
    this.docsPath = path.join(basePath, 'docs', 'api');
  }

  /**
   * Main entry point - analyze and generate API components
   */
  async buildApiComponents(changedFiles: string[]): Promise<void> {
    console.log('🚀 API Endpoint Builder started');
    console.log('📁 Changed files:', changedFiles);

    try {
      // Parse API configurations from changed files
      const endpoints = await this.parseApiEndpoints(changedFiles);
      
      if (endpoints.length === 0) {
        console.log('ℹ️  No new API endpoints detected');
        return;
      }

      console.log(`🔍 Found ${endpoints.length} API endpoints to process`);

      // Generate components for each endpoint
      for (const endpoint of endpoints) {
        await this.generateEndpointComponents(endpoint);
      }

      // Generate or update OpenAPI documentation
      await this.generateOpenApiDoc(endpoints);

      console.log('✅ API Endpoint Builder completed successfully');
    } catch (error) {
      console.error('❌ API Endpoint Builder failed:', error);
      throw error;
    }
  }

  /**
   * Parse API endpoints from CDK stack files
   */
  private async parseApiEndpoints(changedFiles: string[]): Promise<ApiEndpoint[]> {
    const endpoints: ApiEndpoint[] = [];

    for (const filePath of changedFiles) {
      if (!filePath.includes('api') && !filePath.includes('stack')) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileEndpoints = this.extractEndpointsFromFile(content, filePath);
        endpoints.push(...fileEndpoints);
      } catch (error) {
        console.warn(`⚠️  Could not parse file ${filePath}:`, error);
      }
    }

    return endpoints;
  }

  /**
   * Extract API endpoints from CDK file content
   */
  private extractEndpointsFromFile(content: string, filePath: string): ApiEndpoint[] {
    const endpoints: ApiEndpoint[] = [];
    
    // Regex patterns to match API Gateway method definitions
    const methodPattern = /(\w+)\.addMethod\(['"`](\w+)['"`],\s*new\s+apigateway\.LambdaIntegration\((\w+)\)/g;
    const resourcePattern = /const\s+(\w+)\s*=\s*\w+\.addResource\(['"`]([^'"`]+)['"`]\)/g;
    
    let match;
    const resources: Record<string, string> = {};
    
    // Extract resource definitions
    while ((match = resourcePattern.exec(content)) !== null) {
      const [, resourceVar, resourcePath] = match;
      resources[resourceVar] = resourcePath;
    }
    
    // Extract method definitions
    while ((match = methodPattern.exec(content)) !== null) {
      const [, resourceVar, method, handlerVar] = match;
      
      // Build the full path
      let fullPath = '/';
      if (resources[resourceVar]) {
        fullPath += resources[resourceVar];
      }
      
      // Convert CDK resource path to API path
      fullPath = fullPath.replace(/\{(\w+)\}/g, '{$1}');
      
      const endpoint: ApiEndpoint = {
        method: method.toUpperCase(),
        path: fullPath,
        resourceName: resourceVar,
        handlerName: this.convertToHandlerName(handlerVar),
        description: this.generateEndpointDescription(method, fullPath),
        parameters: this.extractParameters(fullPath, content),
        responses: this.generateDefaultResponses(),
        authentication: this.extractAuthentication(content, resourceVar),
      };

      endpoints.push(endpoint);
    }

    return endpoints;
  }

  /**
   * Generate Lambda handler, validation schema, and documentation for an endpoint
   */
  private async generateEndpointComponents(endpoint: ApiEndpoint): Promise<void> {
    console.log(`🔧 Generating components for ${endpoint.method} ${endpoint.path}`);

    // Determine handler file path based on endpoint
    const handlerDir = this.getHandlerDirectory(endpoint.path);
    const handlerFile = path.join(this.lambdaPath, handlerDir, `${endpoint.handlerName}.ts`);

    // Check if handler already exists
    if (fs.existsSync(handlerFile)) {
      console.log(`ℹ️  Handler already exists: ${handlerFile}`);
      return;
    }

    // Create handler directory if it doesn't exist
    const handlerDirPath = path.dirname(handlerFile);
    if (!fs.existsSync(handlerDirPath)) {
      fs.mkdirSync(handlerDirPath, { recursive: true });
    }

    // Generate Lambda handler
    const handlerContent = this.generateLambdaHandler(endpoint);
    fs.writeFileSync(handlerFile, handlerContent);

    // Generate validation schema
    const schemaFile = path.join(handlerDirPath, `${endpoint.handlerName}.schema.ts`);
    const schemaContent = this.generateValidationSchema(endpoint);
    fs.writeFileSync(schemaFile, schemaContent);

    console.log(`✅ Generated handler: ${handlerFile}`);
    console.log(`✅ Generated schema: ${schemaFile}`);
  }

  /**
   * Generate Lambda handler TypeScript code
   */
  private generateLambdaHandler(endpoint: ApiEndpoint): string {
    const hasPathParams = endpoint.path.includes('{');
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);
    const requiresAuth = endpoint.authentication !== 'NONE';

    return `import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
${requiresAuth ? "import { AuthMiddleware, AuthContext, PERMISSIONS } from '../auth/auth-middleware';" : ''}
import { validateRequest, ${endpoint.handlerName}Schema } from './${endpoint.handlerName}.schema';

// Initialize AWS clients with connection reuse
const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION,
  maxAttempts: 3,
});

// Environment variables validation
const REQUIRED_ENV_VARS = [
  'AWS_REGION',
  // Add other required environment variables here
];

REQUIRED_ENV_VARS.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(\`Missing required environment variable: \${envVar}\`);
  }
});

${hasBody ? `
interface ${this.capitalize(endpoint.handlerName)}Request {
  // TODO: Define request interface based on your API requirements
  [key: string]: any;
}
` : ''}

interface ${this.capitalize(endpoint.handlerName)}Response {
  // TODO: Define response interface based on your API requirements
  message: string;
  data?: any;
}

/**
 * AWS Lambda handler for ${endpoint.method} ${endpoint.path}
 * ${endpoint.description}
 * 
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * ${requiresAuth ? '@param auth - Authentication context' : ''}
 * @returns API Gateway proxy result
 */
export const handler = ${requiresAuth ? 'AuthMiddleware.withAuth(' : ''}async (
  event: APIGatewayProxyEvent,
  context: Context${requiresAuth ? ',\n  auth: AuthContext' : ''}
): Promise<APIGatewayProxyResult> => {
  const correlationId = context.awsRequestId;
  
  console.log('${endpoint.method} ${endpoint.path} request:', {
    ${hasPathParams ? 'pathParameters: event.pathParameters,' : ''}
    ${endpoint.method !== 'GET' ? 'body: event.body,' : ''}
    ${requiresAuth ? 'userId: auth.user.userId,' : ''}
    correlationId,
  });

  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return createCorsResponse();
    }

    ${hasPathParams ? `
    // Extract and validate path parameters
    const pathParams = event.pathParameters;
    if (!pathParams) {
      return createErrorResponse(400, 'Missing path parameters', correlationId);
    }
    ` : ''}

    ${hasBody ? `
    // Parse and validate request body
    let requestBody: ${this.capitalize(endpoint.handlerName)}Request;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch (error) {
      return createErrorResponse(400, 'Invalid JSON in request body', correlationId);
    }

    // Validate request against schema
    const validation = validateRequest(requestBody, ${endpoint.handlerName}Schema);
    if (!validation.valid) {
      return createErrorResponse(400, \`Validation error: \${validation.errors?.join(', ')}\`, correlationId);
    }
    ` : ''}

    // TODO: Implement your business logic here
    const result = await process${this.capitalize(endpoint.handlerName)}(
      ${hasPathParams ? 'pathParams,' : ''}
      ${hasBody ? 'requestBody,' : ''}
      ${requiresAuth ? 'auth,' : ''}
      correlationId
    );

    return createSuccessResponse(result, correlationId);

  } catch (error) {
    console.error('${endpoint.handlerName} error:', error, { correlationId });
    
    // Handle specific error types
    if (error instanceof ValidationError) {
      return createErrorResponse(400, error.message, correlationId);
    }
    
    if (error instanceof NotFoundError) {
      return createErrorResponse(404, error.message, correlationId);
    }
    
    if (error instanceof UnauthorizedError) {
      return createErrorResponse(403, error.message, correlationId);
    }
    
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
}${requiresAuth ? `,\n  ${endpoint.permissions ? `[${endpoint.permissions.map(p => `PERMISSIONS.${p}`).join(', ')}]` : '[]'}\n);` : ';'}

/**
 * Process ${endpoint.handlerName} business logic
 * TODO: Implement the actual business logic for this endpoint
 */
async function process${this.capitalize(endpoint.handlerName)}(
  ${hasPathParams ? 'pathParams: { [key: string]: string },' : ''}
  ${hasBody ? `requestBody: ${this.capitalize(endpoint.handlerName)}Request,` : ''}
  ${requiresAuth ? 'auth: AuthContext,' : ''}
  correlationId: string
): Promise<${this.capitalize(endpoint.handlerName)}Response> {
  
  // TODO: Replace this placeholder with your actual implementation
  console.log('Processing ${endpoint.handlerName}:', {
    ${hasPathParams ? 'pathParams,' : ''}
    ${hasBody ? 'requestBody,' : ''}
    ${requiresAuth ? 'userId: auth.user.userId,' : ''}
    correlationId,
  });

  // Example implementation - replace with your logic
  return {
    message: '${endpoint.handlerName} processed successfully',
    data: {
      ${hasPathParams ? 'pathParams,' : ''}
      ${hasBody ? 'requestBody,' : ''}
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create CORS preflight response
 */
function createCorsResponse(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': '${endpoint.method},OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
    body: '',
  };
}

/**
 * Create success response
 */
function createSuccessResponse(data: any, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': '${endpoint.method},OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: true,
      data,
      correlationId,
    }),
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode: number, message: string, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': '${endpoint.method},OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: false,
      error: {
        message,
        code: statusCode,
      },
      correlationId,
    }),
  };
}

// Custom error classes
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
`;
  }

  /**
   * Generate validation schema TypeScript code
   */
  private generateValidationSchema(endpoint: ApiEndpoint): string {
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(endpoint.method);

    return `/**
 * Validation schemas for ${endpoint.method} ${endpoint.path}
 * Generated by API Endpoint Builder
 */

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

${hasBody ? `
export const ${endpoint.handlerName}Schema = {
  type: 'object',
  properties: {
    // TODO: Define your request schema properties here
    // Example:
    // name: { type: 'string', minLength: 1, maxLength: 100 },
    // email: { type: 'string', format: 'email' },
    // age: { type: 'number', minimum: 0, maximum: 150 }
  },
  required: [
    // TODO: Add required field names here
    // Example: 'name', 'email'
  ],
  additionalProperties: false,
};
` : `
export const ${endpoint.handlerName}Schema = {
  // No request body validation needed for ${endpoint.method} requests
};
`}

/**
 * Validate request data against schema
 */
export function validateRequest(data: any, schema: any): ValidationResult {
  const errors: string[] = [];
  
  if (!data && schema.required && schema.required.length > 0) {
    return {
      valid: false,
      errors: ['Request body is required'],
    };
  }

  // Basic validation - you might want to use a library like Ajv for more complex validation
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data) || data[field] === null || data[field] === undefined) {
        errors.push(\`Missing required field: \${field}\`);
      }
    }
  }

  if (schema.properties) {
    for (const [field, fieldSchema] of Object.entries(schema.properties)) {
      if (field in data) {
        const fieldErrors = validateField(data[field], fieldSchema as any, field);
        errors.push(...fieldErrors);
      }
    }
  }

  if (schema.additionalProperties === false) {
    const allowedFields = Object.keys(schema.properties || {});
    for (const field of Object.keys(data)) {
      if (!allowedFields.includes(field)) {
        errors.push(\`Unexpected field: \${field}\`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate individual field
 */
function validateField(value: any, schema: any, fieldName: string): string[] {
  const errors: string[] = [];

  if (schema.type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type) {
      errors.push(\`Field \${fieldName} must be of type \${schema.type}, got \${actualType}\`);
      return errors; // Skip further validation if type is wrong
    }
  }

  if (schema.type === 'string') {
    if (schema.minLength && value.length < schema.minLength) {
      errors.push(\`Field \${fieldName} must be at least \${schema.minLength} characters long\`);
    }
    if (schema.maxLength && value.length > schema.maxLength) {
      errors.push(\`Field \${fieldName} must be at most \${schema.maxLength} characters long\`);
    }
    if (schema.format === 'email' && !isValidEmail(value)) {
      errors.push(\`Field \${fieldName} must be a valid email address\`);
    }
  }

  if (schema.type === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(\`Field \${fieldName} must be at least \${schema.minimum}\`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(\`Field \${fieldName} must be at most \${schema.maximum}\`);
    }
  }

  return errors;
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Path parameter validation schemas
 */
export const pathParameterSchemas = {
  ${endpoint.path.includes('{mediaId}') ? `
  mediaId: {
    type: 'string',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
    description: 'UUID format media identifier',
  },` : ''}
  ${endpoint.path.includes('{userId}') ? `
  userId: {
    type: 'string',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
    description: 'UUID format user identifier',
  },` : ''}
  // Add more path parameter validations as needed
};

/**
 * Query parameter validation schemas
 */
export const queryParameterSchemas = {
  limit: {
    type: 'number',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Number of items to return',
  },
  offset: {
    type: 'number',
    minimum: 0,
    default: 0,
    description: 'Number of items to skip',
  },
  // Add more query parameter validations as needed
};
`;
  }

  /**
   * Generate or update OpenAPI documentation
   */
  private async generateOpenApiDoc(endpoints: ApiEndpoint[]): Promise<void> {
    console.log('📚 Generating OpenAPI documentation');

    // Ensure docs directory exists
    if (!fs.existsSync(this.docsPath)) {
      fs.mkdirSync(this.docsPath, { recursive: true });
    }

    const openApiDoc = {
      openapi: '3.0.3',
      info: {
        title: 'GRACE Media Analysis API',
        description: 'API for media upload, analysis, and deepfake detection',
        version: '1.0.0',
        contact: {
          name: 'GRACE Team',
          email: 'support@grace-media.com',
        },
      },
      servers: [
        {
          url: 'https://api.grace-media.com/v1',
          description: 'Production server',
        },
        {
          url: 'https://staging-api.grace-media.com/v1',
          description: 'Staging server',
        },
      ],
      paths: this.generateOpenApiPaths(endpoints),
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
        schemas: this.generateOpenApiSchemas(endpoints),
      },
      security: [
        { BearerAuth: [] },
        { ApiKeyAuth: [] },
      ],
    };

    const docFile = path.join(this.docsPath, 'openapi.json');
    fs.writeFileSync(docFile, JSON.stringify(openApiDoc, null, 2));

    console.log(`✅ Generated OpenAPI documentation: ${docFile}`);
  }

  // Helper methods
  private convertToHandlerName(handlerVar: string): string {
    return handlerVar
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
  }

  private generateEndpointDescription(method: string, path: string): string {
    const action = method.toLowerCase();
    const resource = path.split('/').pop() || 'resource';
    
    switch (method.toUpperCase()) {
      case 'GET':
        return path.includes('{') 
          ? `Retrieve a specific ${resource}` 
          : `List ${resource}s`;
      case 'POST':
        return `Create a new ${resource}`;
      case 'PUT':
        return `Update a ${resource}`;
      case 'PATCH':
        return `Partially update a ${resource}`;
      case 'DELETE':
        return `Delete a ${resource}`;
      default:
        return `${action} ${resource}`;
    }
  }

  private extractParameters(path: string, content: string): ApiEndpoint['parameters'] {
    const parameters: ApiEndpoint['parameters'] = {};
    
    // Extract path parameters
    const pathParams = path.match(/\{(\w+)\}/g);
    if (pathParams) {
      parameters.path = pathParams.map(p => p.slice(1, -1));
    }
    
    // Extract query parameters from requestParameters
    const queryParamPattern = /'method\.request\.querystring\.(\w+)':\s*(true|false)/g;
    let match;
    while ((match = queryParamPattern.exec(content)) !== null) {
      if (!parameters.query) parameters.query = [];
      parameters.query.push(match[1]);
    }
    
    return parameters;
  }

  private extractAuthentication(content: string, resourceVar: string): string {
    if (content.includes(`${resourceVar}.addMethod`) && content.includes('AuthorizationType.IAM')) {
      return 'IAM';
    }
    if (content.includes('AuthorizationType.COGNITO_USER_POOLS')) {
      return 'COGNITO';
    }
    return 'NONE';
  }

  private generateDefaultResponses(): ApiEndpoint['responses'] {
    return {
      '200': {
        description: 'Successful response',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            correlationId: { type: 'string' },
          },
        },
      },
      '400': {
        description: 'Bad request',
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                code: { type: 'number' },
              },
            },
            correlationId: { type: 'string' },
          },
        },
      },
      '401': {
        description: 'Unauthorized',
      },
      '403': {
        description: 'Forbidden',
      },
      '404': {
        description: 'Not found',
      },
      '500': {
        description: 'Internal server error',
      },
    };
  }

  private getHandlerDirectory(path: string): string {
    const segments = path.split('/').filter(Boolean);
    
    if (segments.includes('media')) return 'media';
    if (segments.includes('auth')) return 'auth';
    if (segments.includes('analysis')) return 'analysis';
    if (segments.includes('review')) return 'review';
    if (segments.includes('notification')) return 'notification';
    if (segments.includes('trust-score')) return 'trust-score';
    if (segments.includes('source-verification')) return 'source-verification';
    
    return 'api';
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private generateOpenApiPaths(endpoints: ApiEndpoint[]): any {
    const paths: any = {};
    
    for (const endpoint of endpoints) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }
      
      paths[endpoint.path][endpoint.method.toLowerCase()] = {
        summary: endpoint.description,
        description: `${endpoint.description} - Auto-generated endpoint`,
        parameters: this.generateOpenApiParameters(endpoint),
        requestBody: endpoint.requestBody ? {
          required: endpoint.requestBody.required,
          content: {
            'application/json': {
              schema: endpoint.requestBody.schema,
            },
          },
        } : undefined,
        responses: endpoint.responses,
        security: endpoint.authentication !== 'NONE' ? [{ BearerAuth: [] }] : [],
        tags: [this.getEndpointTag(endpoint.path)],
      };
    }
    
    return paths;
  }

  private generateOpenApiParameters(endpoint: ApiEndpoint): any[] {
    const parameters: any[] = [];
    
    if (endpoint.parameters?.path) {
      for (const param of endpoint.parameters.path) {
        parameters.push({
          name: param,
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: `${param} identifier`,
        });
      }
    }
    
    if (endpoint.parameters?.query) {
      for (const param of endpoint.parameters.query) {
        parameters.push({
          name: param,
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: `${param} filter`,
        });
      }
    }
    
    return parameters;
  }

  private generateOpenApiSchemas(endpoints: ApiEndpoint[]): any {
    return {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          correlationId: { type: 'string', format: 'uuid' },
        },
        required: ['success', 'correlationId'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'number' },
            },
            required: ['message', 'code'],
          },
          correlationId: { type: 'string', format: 'uuid' },
        },
        required: ['success', 'error', 'correlationId'],
      },
    };
  }

  private getEndpointTag(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments[0] || 'general';
  }
}

// Export for use in hooks
export default ApiEndpointBuilder;