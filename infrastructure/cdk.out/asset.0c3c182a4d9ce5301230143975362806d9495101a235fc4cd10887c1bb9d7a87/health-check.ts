import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { SFNClient, DescribeStateMachineCommand } from '@aws-sdk/client-sfn';

// Initialize AWS clients with connection reuse
const dynamoClient = new DynamoDBClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 2,
});

const s3Client = new S3Client({ 
  region: process.env.AWS_REGION,
  maxAttempts: 2,
});

const sfnClient = new SFNClient({ 
  region: process.env.AWS_REGION,
  maxAttempts: 2,
});

// Environment variables
const MEDIA_TABLE = process.env.MEDIA_TABLE;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const ANALYSIS_STATE_MACHINE_ARN = process.env.ANALYSIS_STATE_MACHINE_ARN;

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  error?: string;
  details?: Record<string, any>;
}

interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  correlationId: string;
  services: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
}

/**
 * AWS Lambda handler for API health check
 * Performs comprehensive health monitoring of all system dependencies
 * 
 * @param event - API Gateway proxy event
 * @param context - Lambda execution context
 * @returns API Gateway proxy result with health status
 */
export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  const correlationId = context.awsRequestId;
  const startTime = Date.now();
  
  console.log('Health check request:', {
    path: event.path,
    method: event.httpMethod,
    correlationId,
  });

  try {
    // Handle OPTIONS request for CORS
    if (event.httpMethod === 'OPTIONS') {
      return createCorsResponse();
    }

    // Perform health checks in parallel
    const healthChecks = await Promise.allSettled([
      checkDynamoDBHealth(),
      checkS3Health(),
      checkStepFunctionsHealth(),
      checkLambdaHealth(),
    ]);

    // Process results
    const services: HealthCheckResult[] = [];
    
    healthChecks.forEach((result, index) => {
      const serviceNames = ['DynamoDB', 'S3', 'StepFunctions', 'Lambda'];
      
      if (result.status === 'fulfilled') {
        services.push(result.value);
      } else {
        services.push({
          service: serviceNames[index],
          status: 'unhealthy',
          responseTime: 0,
          error: result.reason?.message || 'Unknown error',
        });
      }
    });

    // Calculate overall health
    const summary = {
      total: services.length,
      healthy: services.filter(s => s.status === 'healthy').length,
      unhealthy: services.filter(s => s.status === 'unhealthy').length,
      degraded: services.filter(s => s.status === 'degraded').length,
    };

    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';
    if (summary.unhealthy > 0) {
      overallStatus = summary.unhealthy >= summary.total / 2 ? 'unhealthy' : 'degraded';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    const healthResponse: SystemHealth = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      environment: process.env.ENVIRONMENT || 'development',
      correlationId,
      services,
      summary,
    };

    const responseTime = Date.now() - startTime;
    
    console.log('Health check completed:', {
      status: overallStatus,
      responseTime,
      correlationId,
    });

    // Return appropriate status code based on health
    const statusCode = overallStatus === 'healthy' ? 200 : 
                     overallStatus === 'degraded' ? 200 : 503;

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'X-Correlation-ID': correlationId,
        'X-Response-Time': responseTime.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
      body: JSON.stringify(healthResponse, null, 2),
    };

  } catch (error) {
    console.error('Health check error:', error, { correlationId });
    
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'X-Correlation-ID': correlationId,
      },
      body: JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        correlationId,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};

/**
 * Check DynamoDB health
 */
async function checkDynamoDBHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    const checks = [];
    
    // Check media table
    if (MEDIA_TABLE) {
      checks.push(
        dynamoClient.send(new DescribeTableCommand({ TableName: MEDIA_TABLE }))
      );
    }
    
    // Check user profiles table
    if (USER_PROFILES_TABLE) {
      checks.push(
        dynamoClient.send(new DescribeTableCommand({ TableName: USER_PROFILES_TABLE }))
      );
    }
    
    if (checks.length === 0) {
      return {
        service: 'DynamoDB',
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: 'No tables configured for health check',
      };
    }
    
    const results = await Promise.all(checks);
    const responseTime = Date.now() - startTime;
    
    // Check if all tables are active
    const allActive = results.every(result => 
      result.Table?.TableStatus === 'ACTIVE'
    );
    
    return {
      service: 'DynamoDB',
      status: allActive ? 'healthy' : 'degraded',
      responseTime,
      details: {
        tablesChecked: results.length,
        activeTables: results.filter(r => r.Table?.TableStatus === 'ACTIVE').length,
      },
    };
    
  } catch (error) {
    return {
      service: 'DynamoDB',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown DynamoDB error',
    };
  }
}

/**
 * Check S3 health
 */
async function checkS3Health(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    if (!MEDIA_BUCKET) {
      return {
        service: 'S3',
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: 'No S3 bucket configured for health check',
      };
    }
    
    await s3Client.send(new HeadBucketCommand({
      Bucket: MEDIA_BUCKET,
    }));
    
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'S3',
      status: 'healthy',
      responseTime,
      details: {
        bucket: MEDIA_BUCKET,
      },
    };
    
  } catch (error) {
    return {
      service: 'S3',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown S3 error',
    };
  }
}

/**
 * Check Step Functions health
 */
async function checkStepFunctionsHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    if (!ANALYSIS_STATE_MACHINE_ARN) {
      return {
        service: 'StepFunctions',
        status: 'degraded',
        responseTime: Date.now() - startTime,
        error: 'No state machine configured for health check',
      };
    }
    
    const result = await sfnClient.send(new DescribeStateMachineCommand({
      stateMachineArn: ANALYSIS_STATE_MACHINE_ARN,
    }));
    
    const responseTime = Date.now() - startTime;
    
    return {
      service: 'StepFunctions',
      status: result.status === 'ACTIVE' ? 'healthy' : 'degraded',
      responseTime,
      details: {
        stateMachine: result.name,
        status: result.status,
      },
    };
    
  } catch (error) {
    return {
      service: 'StepFunctions',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown Step Functions error',
    };
  }
}

/**
 * Check Lambda health (self-check)
 */
async function checkLambdaHealth(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  
  try {
    // Basic Lambda health indicators
    const memoryUsed = process.memoryUsage();
    const uptime = process.uptime();
    const responseTime = Date.now() - startTime;
    
    // Check if memory usage is reasonable (less than 80% of allocated)
    const memoryLimit = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '128') * 1024 * 1024;
    const memoryUsagePercent = (memoryUsed.heapUsed / memoryLimit) * 100;
    
    const status = memoryUsagePercent > 80 ? 'degraded' : 'healthy';
    
    return {
      service: 'Lambda',
      status,
      responseTime,
      details: {
        memoryUsed: Math.round(memoryUsed.heapUsed / 1024 / 1024), // MB
        memoryLimit: Math.round(memoryLimit / 1024 / 1024), // MB
        memoryUsagePercent: Math.round(memoryUsagePercent),
        uptime: Math.round(uptime),
        nodeVersion: process.version,
      },
    };
    
  } catch (error) {
    return {
      service: 'Lambda',
      status: 'unhealthy',
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown Lambda error',
    };
  }
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
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
    body: '',
  };
}