/**
 * Centralized API router for handling all API Gateway requests
 * Provides routing, validation, authentication, and error handling
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { AuthMiddleware, AuthContext, PERMISSIONS } from '../auth/auth-middleware';
import { validateRequest, TrustScoreSchemas, SourceVerificationSchemas, ChainOfCustodySchemas, DiscrepancySchemas, MediaUploadSchemas } from './validation-schemas';
import { createErrorResponse, createSuccessResponse, createCorsResponse, createValidationErrorResponse, withErrorHandler } from './error-handler';

interface Route {
  method: string;
  path: string;
  handler: (event: APIGatewayProxyEvent, context: Context, auth?: AuthContext) => Promise<APIGatewayProxyResult>;
  requiresAuth?: boolean;
  permissions?: string[];
  validation?: {
    query?: any;
    body?: any;
    params?: any;
  };
}

/**
 * Main API Gateway handler with routing
 */
export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const correlationId = context.awsRequestId;
  
  console.log('API request:', {
    method: event.httpMethod,
    path: event.path,
    resource: event.resource,
    correlationId,
  });

  try {
    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
      return createCorsResponse();
    }

    // Find matching route
    const route = findRoute(event.httpMethod, event.resource);
    if (!route) {
      return createErrorResponse(404, 'Route not found', correlationId);
    }

    // Validate request
    const validationResult = validateRoute(event, route);
    if (!validationResult.valid) {
      return createValidationErrorResponse(validationResult.errors, correlationId);
    }

    // Handle authentication if required
    let auth: AuthContext | undefined;
    if (route.requiresAuth) {
      try {
        auth = await AuthMiddleware.authenticate(event, context, route.permissions);
      } catch (error) {
        console.error('Authentication failed:', error, { correlationId });
        return createErrorResponse(401, 'Authentication failed', correlationId);
      }
    }

    // Execute route handler with error handling
    const wrappedHandler = withErrorHandler(route.handler, correlationId);
    return await wrappedHandler(event, context, auth);

  } catch (error) {
    console.error('Router error:', error, { correlationId });
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
};

/**
 * Route definitions
 */
const routes: Route[] = [
  // Health check
  {
    method: 'GET',
    path: '/health',
    handler: handleHealthCheck,
    requiresAuth: false,
  },

  // Trust Score API
  {
    method: 'GET',
    path: '/trust-scores',
    handler: handleGetTrustScores,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      query: TrustScoreSchemas.getTrustScoresQuery,
    },
  },
  {
    method: 'GET',
    path: '/trust-scores/{mediaId}',
    handler: handleGetMediaTrustScore,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      query: TrustScoreSchemas.getMediaTrustScoreQuery,
    },
  },
  {
    method: 'POST',
    path: '/trust-scores/{mediaId}',
    handler: handleCalculateTrustScore,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      body: TrustScoreSchemas.calculateTrustScoreRequest,
    },
  },

  // Source Verification API
  {
    method: 'POST',
    path: '/source-verification/{mediaId}',
    handler: handleVerifySource,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      body: SourceVerificationSchemas.verifySourceRequest,
    },
  },
  {
    method: 'GET',
    path: '/source-verification/{mediaId}',
    handler: handleGetSourceVerification,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },

  // Chain of Custody API
  {
    method: 'POST',
    path: '/chain-of-custody',
    handler: handleRecordCustodyEvent,
    requiresAuth: true,
    permissions: [PERMISSIONS.MODERATE_CONTENT],
    validation: {
      body: ChainOfCustodySchemas.recordCustodyEventRequest,
    },
  },
  {
    method: 'GET',
    path: '/chain-of-custody/{mediaId}',
    handler: handleGetCustodyChain,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      query: ChainOfCustodySchemas.getCustodyChainQuery,
    },
  },
  {
    method: 'GET',
    path: '/chain-of-custody/{mediaId}/provenance',
    handler: handleGetProvenance,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'GET',
    path: '/chain-of-custody/{mediaId}/verify',
    handler: handleVerifyChainIntegrity,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },

  // Discrepancy Detection API
  {
    method: 'POST',
    path: '/discrepancies',
    handler: handleDetectDiscrepancies,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      body: DiscrepancySchemas.detectDiscrepanciesRequest,
    },
  },
  {
    method: 'GET',
    path: '/discrepancies',
    handler: handleGetDiscrepancies,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
    validation: {
      query: DiscrepancySchemas.getDiscrepanciesQuery,
    },
  },
  {
    method: 'POST',
    path: '/discrepancies/{mediaId}',
    handler: handleAnalyzeMediaDiscrepancies,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'GET',
    path: '/discrepancies/{mediaId}',
    handler: handleGetMediaDiscrepancies,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'POST',
    path: '/discrepancies/patterns',
    handler: handleAnalyzePatterns,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },

  // Media Upload API
  {
    method: 'POST',
    path: '/media',
    handler: handleMediaUpload,
    requiresAuth: true,
    permissions: [PERMISSIONS.UPLOAD_MEDIA],
    validation: {
      body: MediaUploadSchemas.uploadRequestSchema,
    },
  },
  {
    method: 'GET',
    path: '/media/{mediaId}',
    handler: handleGetMedia,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'POST',
    path: '/media/{mediaId}/analyze',
    handler: handleAnalyzeMedia,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'GET',
    path: '/media/{mediaId}/status',
    handler: handleGetAnalysisStatus,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
  {
    method: 'GET',
    path: '/media/{mediaId}/analysis',
    handler: handleGetAnalysisResults,
    requiresAuth: true,
    permissions: [PERMISSIONS.VIEW_ANALYSIS],
  },
];

/**
 * Find matching route for request
 */
function findRoute(method: string, resource: string): Route | undefined {
  return routes.find(route => {
    if (route.method !== method) return false;
    
    // Convert API Gateway resource format to match our route paths
    const normalizedResource = resource.replace(/\{([^}]+)\}/g, '{$1}');
    return route.path === normalizedResource;
  });
}

/**
 * Validate request against route validation rules
 */
function validateRoute(event: APIGatewayProxyEvent, route: Route): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!route.validation) {
    return { valid: true, errors: [] };
  }
  
  // Validate query parameters
  if (route.validation.query) {
    const queryResult = validateRequest(event.queryStringParameters || {}, route.validation.query);
    if (!queryResult.valid) {
      errors.push(...queryResult.errors.map(e => `Query: ${e}`));
    }
  }
  
  // Validate request body
  if (route.validation.body && event.body) {
    try {
      const body = JSON.parse(event.body);
      const bodyResult = validateRequest(body, route.validation.body);
      if (!bodyResult.valid) {
        errors.push(...bodyResult.errors.map(e => `Body: ${e}`));
      }
    } catch (error) {
      errors.push('Body: Invalid JSON format');
    }
  }
  
  // Validate path parameters
  if (route.validation.params) {
    const paramsResult = validateRequest(event.pathParameters || {}, route.validation.params);
    if (!paramsResult.valid) {
      errors.push(...paramsResult.errors.map(e => `Path: ${e}`));
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Route handlers - these delegate to specific Lambda functions
 */

async function handleHealthCheck(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
  // Import and call the health check handler
  const { handler: healthHandler } = await import('./health-check');
  return healthHandler(event, context);
}

async function handleGetTrustScores(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  // Delegate to trust score calculator
  const { handler: trustScoreHandler } = await import('../trust_score_calculator/index');
  
  // Modify event to indicate this is a retrieval operation
  const modifiedEvent = {
    ...event,
    httpMethod: 'GET',
    operation: 'list',
    queryStringParameters: event.queryStringParameters,
  };
  
  return trustScoreHandler(modifiedEvent, context);
}

async function handleGetMediaTrustScore(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: trustScoreHandler } = await import('../trust_score_calculator/index');
  
  const modifiedEvent = {
    ...event,
    httpMethod: 'GET',
    operation: 'retrieve',
    mediaId: event.pathParameters?.mediaId,
    queryStringParameters: event.queryStringParameters,
  };
  
  return trustScoreHandler(modifiedEvent, context);
}

async function handleCalculateTrustScore(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: trustScoreHandler } = await import('../trust_score_calculator/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'calculate',
  };
  
  return trustScoreHandler(modifiedEvent, context);
}

async function handleVerifySource(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: sourceHandler } = await import('../source_verifier/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'verify',
  };
  
  return sourceHandler(modifiedEvent, context);
}

async function handleGetSourceVerification(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: sourceHandler } = await import('../source_verifier/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'retrieve',
  };
  
  return sourceHandler(modifiedEvent, context);
}

async function handleRecordCustodyEvent(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: custodyHandler } = await import('../chain_of_custody/index');
  
  const modifiedEvent = {
    ...event,
    operation: 'record',
    actor: auth.user.userId,
  };
  
  return custodyHandler(modifiedEvent, context);
}

async function handleGetCustodyChain(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: custodyHandler } = await import('../chain_of_custody/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'retrieve',
  };
  
  return custodyHandler(modifiedEvent, context);
}

async function handleGetProvenance(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: custodyHandler } = await import('../chain_of_custody/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'provenance',
  };
  
  return custodyHandler(modifiedEvent, context);
}

async function handleVerifyChainIntegrity(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: custodyHandler } = await import('../chain_of_custody/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'verify',
  };
  
  return custodyHandler(modifiedEvent, context);
}

async function handleDetectDiscrepancies(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: discrepancyHandler } = await import('../discrepancy_detector/index');
  
  const modifiedEvent = {
    ...event,
    operation: 'detect',
  };
  
  return discrepancyHandler(modifiedEvent, context);
}

async function handleGetDiscrepancies(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: discrepancyHandler } = await import('../discrepancy_detector/index');
  
  const modifiedEvent = {
    ...event,
    operation: 'list',
  };
  
  return discrepancyHandler(modifiedEvent, context);
}

async function handleAnalyzeMediaDiscrepancies(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: discrepancyHandler } = await import('../discrepancy_detector/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'analyze',
  };
  
  return discrepancyHandler(modifiedEvent, context);
}

async function handleGetMediaDiscrepancies(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: discrepancyHandler } = await import('../discrepancy_detector/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'retrieve',
  };
  
  return discrepancyHandler(modifiedEvent, context);
}

async function handleAnalyzePatterns(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: discrepancyHandler } = await import('../discrepancy_detector/index');
  
  const modifiedEvent = {
    ...event,
    operation: 'patterns',
  };
  
  return discrepancyHandler(modifiedEvent, context);
}

async function handleMediaUpload(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: uploadHandler } = await import('../media-upload/upload-handler');
  return uploadHandler(event, context);
}

async function handleGetMedia(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: uploadHandler } = await import('../media-upload/upload-handler');
  return uploadHandler(event, context);
}

async function handleAnalyzeMedia(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: deepfakeHandler } = await import('../deepfake_detector/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'analyze',
  };
  
  return deepfakeHandler(modifiedEvent, context);
}

async function handleGetAnalysisStatus(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: workflowHandler } = await import('../workflow_orchestrator/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'status',
  };
  
  return workflowHandler(modifiedEvent, context);
}

async function handleGetAnalysisResults(event: APIGatewayProxyEvent, context: Context, auth: AuthContext): Promise<APIGatewayProxyResult> {
  const { handler: workflowHandler } = await import('../workflow_orchestrator/index');
  
  const modifiedEvent = {
    ...event,
    mediaId: event.pathParameters?.mediaId,
    operation: 'results',
  };
  
  return workflowHandler(modifiedEvent, context);
}