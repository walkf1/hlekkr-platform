# API Endpoint Builder Hook

The API Endpoint Builder is an intelligent Kiro hook that automatically generates Lambda handlers, validation schemas, and OpenAPI documentation when you modify API Gateway configurations in your CDK stack files.

## 🚀 Features

### Automatic Code Generation
- **Lambda Handlers**: Complete TypeScript Lambda functions with proper error handling, CORS, and authentication
- **Validation Schemas**: Input validation with custom schema definitions
- **OpenAPI Documentation**: Auto-generated API documentation in OpenAPI 3.0 format
- **Error Handling**: Comprehensive error handling patterns with proper HTTP status codes
- **Authentication Integration**: Seamless integration with existing auth middleware

### Smart Analysis
- **CDK Parsing**: Intelligently parses CDK stack files to identify new API endpoints
- **Path Detection**: Automatically determines handler directory structure based on endpoint paths
- **Method Recognition**: Supports all HTTP methods (GET, POST, PUT, PATCH, DELETE)
- **Parameter Extraction**: Identifies path parameters, query parameters, and request bodies

## 📁 Generated File Structure

When you add a new API endpoint, the hook generates:

```
infrastructure/lambda/
├── {category}/
│   ├── {handler-name}.ts          # Main Lambda handler
│   ├── {handler-name}.schema.ts   # Validation schemas
│   └── README.md                  # Handler documentation
└── docs/
    └── api/
        └── openapi.json           # OpenAPI specification
```

## 🔧 How It Works

### 1. Trigger Detection
The hook monitors changes to:
- `infrastructure/lib/*api*.ts`
- `infrastructure/lib/**/*api*.ts` 
- `infrastructure/lib/*stack*.ts`

### 2. CDK Analysis
When triggered, it:
- Parses CDK files for `addMethod` calls
- Extracts resource paths and HTTP methods
- Identifies Lambda integration handlers
- Determines authentication requirements

### 3. Code Generation
For each new endpoint, it generates:
- Complete Lambda handler with TypeScript types
- Request/response validation schemas
- Error handling patterns
- CORS configuration
- Authentication middleware integration

## 📝 Example Generated Handler

```typescript
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AuthMiddleware, AuthContext, PERMISSIONS } from '../auth/auth-middleware';
import { validateRequest, createMediaSchema } from './create-media.schema';

export const handler = AuthMiddleware.withAuth(
  async (event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> => {
    const correlationId = context.awsRequestId;
    
    try {
      // Parse and validate request
      const requestBody = JSON.parse(event.body || '{}');
      const validation = validateRequest(requestBody, createMediaSchema);
      
      if (!validation.valid) {
        return createErrorResponse(400, `Validation error: ${validation.errors?.join(', ')}`, correlationId);
      }
      
      // Process business logic
      const result = await processCreateMedia(requestBody, auth, correlationId);
      
      return createSuccessResponse(result, correlationId);
      
    } catch (error) {
      console.error('Handler error:', error, { correlationId });
      return createErrorResponse(500, 'Internal server error', correlationId);
    }
  },
  [PERMISSIONS.UPLOAD_MEDIA]
);
```

## 🛠️ Configuration

### Hook Configuration (`api-endpoint-builder.json`)
```json
{
  "name": "API Endpoint Builder",
  "trigger": {
    "type": "file_change",
    "patterns": ["infrastructure/lib/*api*.ts"],
    "conditions": [
      {
        "type": "content_contains",
        "patterns": ["addMethod", "LambdaIntegration"]
      }
    ]
  },
  "settings": {
    "autoApprove": false,
    "runOnSave": true,
    "debounceMs": 2000
  }
}
```

### Environment Variables
The generated handlers expect these environment variables:
- `AWS_REGION`: AWS region
- `MEDIA_TABLE`: DynamoDB table name (if applicable)
- `USER_PROFILES_TABLE`: User profiles table name (if auth required)
- `MEDIA_BUCKET`: S3 bucket name (if applicable)

## 📋 Handler Categories

The hook automatically organizes handlers by category based on the API path:

| Path Pattern | Directory | Purpose |
|--------------|-----------|---------|
| `/media/*` | `media/` | Media upload and management |
| `/auth/*` | `auth/` | Authentication and authorization |
| `/analysis/*` | `analysis/` | Media analysis and processing |
| `/review/*` | `review/` | Human review workflows |
| `/notification/*` | `notification/` | Notifications and alerts |
| `/trust-score/*` | `trust-score/` | Trust score calculations |
| `/source-verification/*` | `source-verification/` | Source verification |
| Other | `api/` | General API endpoints |

## 🔍 Validation Schemas

Generated validation schemas include:

### Request Body Validation
```typescript
export const createMediaSchema = {
  type: 'object',
  properties: {
    fileName: { type: 'string', minLength: 1, maxLength: 255 },
    fileSize: { type: 'number', minimum: 1, maximum: 500000000 },
    contentType: { type: 'string', enum: ['image/jpeg', 'image/png', 'video/mp4'] }
  },
  required: ['fileName', 'fileSize', 'contentType'],
  additionalProperties: false
};
```

### Path Parameter Validation
```typescript
export const pathParameterSchemas = {
  mediaId: {
    type: 'string',
    pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',
    description: 'UUID format media identifier'
  }
};
```

## 📚 OpenAPI Documentation

The hook generates comprehensive OpenAPI 3.0 documentation including:

- **Endpoint Definitions**: All HTTP methods and paths
- **Request/Response Schemas**: Complete data models
- **Authentication**: Security scheme definitions
- **Error Responses**: Standard error formats
- **Examples**: Sample requests and responses

### Generated OpenAPI Structure
```json
{
  "openapi": "3.0.3",
  "info": {
    "title": "GRACE Media Analysis API",
    "version": "1.0.0"
  },
  "paths": {
    "/media": {
      "post": {
        "summary": "Create new media",
        "requestBody": { "..." },
        "responses": { "..." },
        "security": [{ "BearerAuth": [] }]
      }
    }
  },
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT"
      }
    }
  }
}
```

## 🎯 Best Practices

### 1. CDK Endpoint Definition
```typescript
// ✅ Good: Clear resource structure
const mediaResource = api.root.addResource('media');
const mediaIdResource = mediaResource.addResource('{mediaId}');

mediaResource.addMethod('POST', new apigateway.LambdaIntegration(uploadHandler));
mediaIdResource.addMethod('GET', new apigateway.LambdaIntegration(getMediaHandler));
```

### 2. Handler Naming
The hook converts CDK handler variable names to kebab-case:
- `uploadHandler` → `upload-handler.ts`
- `getMediaHandler` → `get-media-handler.ts`
- `trustScoreCalculator` → `trust-score-calculator.ts`

### 3. Authentication Integration
```typescript
// The hook detects authentication requirements
mediaResource.addMethod('POST', integration, {
  authorizationType: apigateway.AuthorizationType.COGNITO_USER_POOLS
});
```

## 🔧 Manual Execution

You can also run the API Endpoint Builder manually:

```bash
# From project root
node .kiro/scripts/run-api-builder.js infrastructure/lib/hlekkr-api-stack.ts

# Or with specific files
node .kiro/scripts/run-api-builder.js file1.ts file2.ts
```

## 🐛 Troubleshooting

### Common Issues

1. **TypeScript Compilation Errors**
   - Ensure `tsconfig.json` is properly configured
   - Install required dependencies: `npm install -g typescript ts-node`

2. **Missing Environment Variables**
   - Check that all required environment variables are defined
   - Update the generated handler's environment variable validation

3. **Authentication Integration**
   - Ensure `auth-middleware.ts` exists and exports required types
   - Update import paths if your auth structure differs

4. **Schema Validation**
   - Customize generated schemas in the `.schema.ts` files
   - Add more complex validation rules as needed

### Debug Mode
Enable debug logging by setting:
```bash
export DEBUG=api-endpoint-builder
```

## 🚀 Getting Started

1. **Install the Hook**: The hook is automatically available in your `.kiro/hooks/` directory

2. **Modify API Configuration**: Add or modify API Gateway endpoints in your CDK stack files

3. **Save the File**: The hook will automatically trigger and generate the necessary components

4. **Review Generated Code**: Check the generated handlers and customize as needed

5. **Test Your Endpoints**: Use the generated OpenAPI documentation to test your new endpoints

## 📈 Advanced Features

### Custom Templates
You can customize the generated code templates by modifying the `ApiEndpointBuilder` class in `.kiro/scripts/api-endpoint-builder.ts`.

### Integration with CI/CD
The hook can be integrated into your CI/CD pipeline to ensure all API endpoints have corresponding handlers and documentation.

### Validation Libraries
Consider integrating with libraries like `ajv` or `joi` for more sophisticated validation in the generated schemas.

---

The API Endpoint Builder Hook streamlines your API development workflow by automatically generating boilerplate code, ensuring consistency, and maintaining up-to-date documentation. This allows you to focus on implementing business logic rather than repetitive setup tasks.