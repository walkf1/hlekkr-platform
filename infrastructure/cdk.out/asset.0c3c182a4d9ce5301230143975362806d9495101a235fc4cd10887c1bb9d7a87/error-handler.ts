/**
 * Standardized error handling and response patterns for API Gateway
 */

import { APIGatewayProxyResult } from 'aws-lambda';

export interface ErrorDetails {
  field?: string;
  code?: string;
  context?: Record<string, any>;
}

export interface ApiError {
  message: string;
  statusCode: number;
  details?: ErrorDetails;
  correlationId?: string;
}

/**
 * Standard error codes used across the API
 */
export const ERROR_CODES = {
  // Client errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_PARAMETER: 'MISSING_PARAMETER',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
  
  // Business logic errors
  MEDIA_NOT_FOUND: 'MEDIA_NOT_FOUND',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  TRUST_SCORE_UNAVAILABLE: 'TRUST_SCORE_UNAVAILABLE',
  SOURCE_VERIFICATION_FAILED: 'SOURCE_VERIFICATION_FAILED',
  CUSTODY_CHAIN_BROKEN: 'CUSTODY_CHAIN_BROKEN',
  DISCREPANCY_DETECTION_FAILED: 'DISCREPANCY_DETECTION_FAILED'
} as const;

/**
 * Create standardized error response
 */
export function createErrorResponse(
  statusCode: number,
  message: string,
  correlationId: string,
  details?: ErrorDetails
): APIGatewayProxyResult {
  const errorCode = getErrorCodeForStatus(statusCode);
  
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
      'X-Error-Code': errorCode,
    },
    body: JSON.stringify({
      success: false,
      error: {
        message,
        code: statusCode,
        errorCode,
        details: details || {},
        timestamp: new Date().toISOString(),
      },
      correlationId,
    }, null, 2),
  };
}

/**
 * Create standardized success response
 */
export function createSuccessResponse(
  data: any,
  correlationId: string,
  statusCode: number = 200,
  additionalHeaders?: Record<string, string>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
      ...additionalHeaders,
    },
    body: JSON.stringify({
      success: true,
      data,
      correlationId,
      timestamp: new Date().toISOString(),
    }, null, 2),
  };
}

/**
 * Create CORS preflight response
 */
export function createCorsResponse(): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
    body: '',
  };
}

/**
 * Handle validation errors
 */
export function createValidationErrorResponse(
  errors: string[],
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    400,
    'Request validation failed',
    correlationId,
    {
      code: ERROR_CODES.VALIDATION_ERROR,
      context: { validationErrors: errors }
    }
  );
}

/**
 * Handle authentication errors
 */
export function createAuthErrorResponse(
  message: string,
  correlationId: string,
  statusCode: number = 401
): APIGatewayProxyResult {
  const errorCode = statusCode === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.FORBIDDEN;
  
  return createErrorResponse(
    statusCode,
    message,
    correlationId,
    { code: errorCode }
  );
}

/**
 * Handle not found errors
 */
export function createNotFoundResponse(
  resource: string,
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    404,
    `${resource} not found`,
    correlationId,
    { code: ERROR_CODES.NOT_FOUND }
  );
}

/**
 * Handle rate limiting errors
 */
export function createRateLimitResponse(
  correlationId: string,
  retryAfter?: number
): APIGatewayProxyResult {
  const headers = retryAfter ? { 'Retry-After': retryAfter.toString() } : {};
  
  return {
    statusCode: 429,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Correlation-ID': correlationId,
      'X-Error-Code': ERROR_CODES.RATE_LIMITED,
      ...headers,
    },
    body: JSON.stringify({
      success: false,
      error: {
        message: 'Rate limit exceeded',
        code: 429,
        errorCode: ERROR_CODES.RATE_LIMITED,
        details: retryAfter ? { retryAfter } : {},
        timestamp: new Date().toISOString(),
      },
      correlationId,
    }),
  };
}

/**
 * Handle service unavailable errors
 */
export function createServiceUnavailableResponse(
  service: string,
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    503,
    `${service} is temporarily unavailable`,
    correlationId,
    { 
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      context: { service }
    }
  );
}

/**
 * Handle timeout errors
 */
export function createTimeoutResponse(
  operation: string,
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    504,
    `${operation} timed out`,
    correlationId,
    { 
      code: ERROR_CODES.TIMEOUT,
      context: { operation }
    }
  );
}

/**
 * Handle dependency errors (external service failures)
 */
export function createDependencyErrorResponse(
  dependency: string,
  correlationId: string
): APIGatewayProxyResult {
  return createErrorResponse(
    502,
    `Dependency error: ${dependency}`,
    correlationId,
    { 
      code: ERROR_CODES.DEPENDENCY_ERROR,
      context: { dependency }
    }
  );
}

/**
 * Get appropriate error code for HTTP status
 */
function getErrorCodeForStatus(statusCode: number): string {
  switch (statusCode) {
    case 400: return ERROR_CODES.VALIDATION_ERROR;
    case 401: return ERROR_CODES.UNAUTHORIZED;
    case 403: return ERROR_CODES.FORBIDDEN;
    case 404: return ERROR_CODES.NOT_FOUND;
    case 409: return ERROR_CODES.CONFLICT;
    case 413: return ERROR_CODES.PAYLOAD_TOO_LARGE;
    case 415: return ERROR_CODES.UNSUPPORTED_MEDIA_TYPE;
    case 429: return ERROR_CODES.RATE_LIMITED;
    case 500: return ERROR_CODES.INTERNAL_ERROR;
    case 502: return ERROR_CODES.DEPENDENCY_ERROR;
    case 503: return ERROR_CODES.SERVICE_UNAVAILABLE;
    case 504: return ERROR_CODES.TIMEOUT;
    default: return ERROR_CODES.INTERNAL_ERROR;
  }
}

/**
 * Error handler wrapper for Lambda functions
 */
export function withErrorHandler<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  correlationId: string
) {
  return async (...args: T): Promise<R | APIGatewayProxyResult> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('Handler error:', error, { correlationId });
      
      // Handle known error types
      if (error instanceof ValidationError) {
        return createValidationErrorResponse(error.errors, correlationId);
      }
      
      if (error instanceof AuthenticationError) {
        return createAuthErrorResponse(error.message, correlationId, error.statusCode);
      }
      
      if (error instanceof NotFoundError) {
        return createNotFoundResponse(error.resource, correlationId);
      }
      
      if (error instanceof RateLimitError) {
        return createRateLimitResponse(correlationId, error.retryAfter);
      }
      
      if (error instanceof ServiceUnavailableError) {
        return createServiceUnavailableResponse(error.service, correlationId);
      }
      
      if (error instanceof TimeoutError) {
        return createTimeoutResponse(error.operation, correlationId);
      }
      
      if (error instanceof DependencyError) {
        return createDependencyErrorResponse(error.dependency, correlationId);
      }
      
      // Handle AWS SDK errors
      if (error.name === 'ResourceNotFoundException') {
        return createNotFoundResponse('Resource', correlationId);
      }
      
      if (error.name === 'ThrottlingException' || error.name === 'ProvisionedThroughputExceededException') {
        return createRateLimitResponse(correlationId);
      }
      
      if (error.name === 'ServiceUnavailableException') {
        return createServiceUnavailableResponse('AWS Service', correlationId);
      }
      
      // Generic error fallback
      return createErrorResponse(
        500,
        'Internal server error',
        correlationId,
        { 
          code: ERROR_CODES.INTERNAL_ERROR,
          context: { errorType: error.name || 'Unknown' }
        }
      );
    }
  };
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Validation failed: ${errors.join(', ')}`);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends Error {
  constructor(public resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfter?: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends Error {
  constructor(public service: string) {
    super(`${service} is unavailable`);
    this.name = 'ServiceUnavailableError';
  }
}

export class TimeoutError extends Error {
  constructor(public operation: string) {
    super(`${operation} timed out`);
    this.name = 'TimeoutError';
  }
}

export class DependencyError extends Error {
  constructor(public dependency: string) {
    super(`Dependency error: ${dependency}`);
    this.name = 'DependencyError';
  }
}

/**
 * Log error with structured format
 */
export function logError(
  error: Error,
  context: Record<string, any>,
  correlationId: string
): void {
  console.error('API Error:', {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    context,
    correlationId,
    timestamp: new Date().toISOString(),
  });
}