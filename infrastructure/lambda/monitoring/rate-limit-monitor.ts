import { ScheduledEvent, Context } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Initialize AWS clients
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });
const snsClient = new SNSClient({ region: process.env.AWS_REGION });
const cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION });

// Environment variables
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE!;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;
const ALERTS_TOPIC_ARN = process.env.ALERTS_TOPIC_ARN!;
const ENVIRONMENT = process.env.ENVIRONMENT!;

interface RateLimitMetrics {
  totalUsers: number;
  activeUsers: number;
  rateLimitViolations: number;
  topViolators: Array<{
    userId: string;
    violations: number;
    email?: string;
  }>;
  endpointMetrics: Record<string, {
    requests: number;
    violations: number;
  }>;
}

interface AlertThresholds {
  violationsPerHour: number;
  violationsPerDay: number;
  suspiciousUserThreshold: number;
  endpointViolationThreshold: number;
}

const ALERT_THRESHOLDS: AlertThresholds = {
  violationsPerHour: 100,
  violationsPerDay: 1000,
  suspiciousUserThreshold: 50,
  endpointViolationThreshold: 200,
};

/**
 * Rate limit monitoring Lambda function
 * Runs every 5 minutes to analyze rate limiting patterns and send alerts
 */
export const handler = async (event: ScheduledEvent, context: Context): Promise<void> => {
  const correlationId = context.awsRequestId;
  
  try {
    console.log('Starting rate limit monitoring', { correlationId });
    
    // Collect rate limit metrics
    const metrics = await collectRateLimitMetrics(correlationId);
    
    // Send metrics to CloudWatch
    await sendMetricsToCloudWatch(metrics, correlationId);
    
    // Check for alerts
    await checkAndSendAlerts(metrics, correlationId);
    
    console.log('Rate limit monitoring completed successfully', { 
      correlationId,
      metrics: {
        totalUsers: metrics.totalUsers,
        activeUsers: metrics.activeUsers,
        violations: metrics.rateLimitViolations,
      },
    });
    
  } catch (error) {
    console.error('Rate limit monitoring failed:', error, { correlationId });
    
    // Send error alert
    await sendErrorAlert(error as Error, correlationId);
    
    throw error;
  }
};

/**
 * Collect rate limit metrics from DynamoDB
 */
async function collectRateLimitMetrics(correlationId: string): Promise<RateLimitMetrics> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 3600000);
  const oneDayAgo = new Date(now.getTime() - 86400000);
  
  // Scan rate limit table for recent activity
  const rateLimitData = await scanRateLimitTable(correlationId);
  
  // Get user profiles for additional context
  const userProfiles = await getUserProfiles(correlationId);
  
  // Process metrics
  const metrics: RateLimitMetrics = {
    totalUsers: userProfiles.length,
    activeUsers: 0,
    rateLimitViolations: 0,
    topViolators: [],
    endpointMetrics: {},
  };
  
  const userViolations: Record<string, number> = {};
  const endpointStats: Record<string, { requests: number; violations: number }> = {};
  
  // Process rate limit records
  for (const record of rateLimitData) {
    const lastRequest = new Date(record.lastRequest);
    
    // Count active users (activity in last hour)
    if (lastRequest > oneHourAgo) {
      metrics.activeUsers++;
    }
    
    // Extract endpoint from rate limit key
    const [userId, httpMethod, resource] = record.rateLimitKey.split(':');
    const endpoint = `${httpMethod}:${resource}`;
    
    if (!endpointStats[endpoint]) {
      endpointStats[endpoint] = { requests: 0, violations: 0 };
    }
    
    // Count total requests
    endpointStats[endpoint].requests += record.minuteRequests + record.hourRequests + record.dayRequests;
    
    // Check for violations (simplified - actual logic would be more complex)
    const hasViolations = record.minuteRequests > 60 || record.hourRequests > 1000 || record.dayRequests > 10000;
    
    if (hasViolations && lastRequest > oneDayAgo) {
      metrics.rateLimitViolations++;
      endpointStats[endpoint].violations++;
      
      if (!userViolations[userId]) {
        userViolations[userId] = 0;
      }
      userViolations[userId]++;
    }
  }
  
  // Get top violators
  const sortedViolators = Object.entries(userViolations)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);
  
  for (const [userId, violations] of sortedViolators) {
    const userProfile = userProfiles.find(p => p.userId === userId);
    metrics.topViolators.push({
      userId,
      violations,
      email: userProfile?.email,
    });
  }
  
  metrics.endpointMetrics = endpointStats;
  
  return metrics;
}

/**
 * Scan rate limit table for recent records
 */
async function scanRateLimitTable(correlationId: string): Promise<any[]> {
  try {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: RATE_LIMIT_TABLE,
      FilterExpression: 'lastRequest > :oneDayAgo',
      ExpressionAttributeValues: {
        ':oneDayAgo': { S: new Date(Date.now() - 86400000).toISOString() },
      },
    }));
    
    return result.Items?.map(item => unmarshall(item)) || [];
    
  } catch (error) {
    console.error('Error scanning rate limit table:', error, { correlationId });
    return [];
  }
}

/**
 * Get user profiles for context
 */
async function getUserProfiles(correlationId: string): Promise<any[]> {
  try {
    const result = await dynamoClient.send(new ScanCommand({
      TableName: USER_PROFILES_TABLE,
      ProjectionExpression: 'userId, email, #role, isActive',
      ExpressionAttributeNames: {
        '#role': 'role',
      },
    }));
    
    return result.Items?.map(item => unmarshall(item)) || [];
    
  } catch (error) {
    console.error('Error getting user profiles:', error, { correlationId });
    return [];
  }
}

/**
 * Send metrics to CloudWatch
 */
async function sendMetricsToCloudWatch(metrics: RateLimitMetrics, correlationId: string): Promise<void> {
  try {
    const metricData = [
      {
        MetricName: 'TotalUsers',
        Value: metrics.totalUsers,
        Unit: 'Count',
        Dimensions: [
          { Name: 'Environment', Value: ENVIRONMENT },
          { Name: 'Service', Value: 'hlekkr-auth' },
        ],
      },
      {
        MetricName: 'ActiveUsers',
        Value: metrics.activeUsers,
        Unit: 'Count',
        Dimensions: [
          { Name: 'Environment', Value: ENVIRONMENT },
          { Name: 'Service', Value: 'hlekkr-auth' },
        ],
      },
      {
        MetricName: 'RateLimitViolations',
        Value: metrics.rateLimitViolations,
        Unit: 'Count',
        Dimensions: [
          { Name: 'Environment', Value: ENVIRONMENT },
          { Name: 'Service', Value: 'hlekkr-auth' },
        ],
      },
    ];
    
    // Add endpoint-specific metrics
    for (const [endpoint, stats] of Object.entries(metrics.endpointMetrics)) {
      metricData.push(
        {
          MetricName: 'EndpointRequests',
          Value: stats.requests,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENVIRONMENT },
            { Name: 'Service', Value: 'hlekkr-auth' },
            { Name: 'Endpoint', Value: endpoint },
          ],
        },
        {
          MetricName: 'EndpointViolations',
          Value: stats.violations,
          Unit: 'Count',
          Dimensions: [
            { Name: 'Environment', Value: ENVIRONMENT },
            { Name: 'Service', Value: 'hlekkr-auth' },
            { Name: 'Endpoint', Value: endpoint },
          ],
        }
      );
    }
    
    await cloudWatchClient.send(new PutMetricDataCommand({
      Namespace: 'Hlekkr/Authentication',
      MetricData: metricData,
    }));
    
    console.log('Metrics sent to CloudWatch successfully', { correlationId });
    
  } catch (error) {
    console.error('Error sending metrics to CloudWatch:', error, { correlationId });
  }
}

/**
 * Check thresholds and send alerts if needed
 */
async function checkAndSendAlerts(metrics: RateLimitMetrics, correlationId: string): Promise<void> {
  const alerts: string[] = [];
  
  // Check overall violation threshold
  if (metrics.rateLimitViolations > ALERT_THRESHOLDS.violationsPerHour) {
    alerts.push(`High rate limit violations detected: ${metrics.rateLimitViolations} violations in the last hour`);
  }
  
  // Check for suspicious users
  const suspiciousUsers = metrics.topViolators.filter(v => v.violations > ALERT_THRESHOLDS.suspiciousUserThreshold);
  if (suspiciousUsers.length > 0) {
    alerts.push(`Suspicious user activity detected: ${suspiciousUsers.length} users with excessive violations`);
  }
  
  // Check endpoint-specific violations
  for (const [endpoint, stats] of Object.entries(metrics.endpointMetrics)) {
    if (stats.violations > ALERT_THRESHOLDS.endpointViolationThreshold) {
      alerts.push(`High violations on endpoint ${endpoint}: ${stats.violations} violations`);
    }
  }
  
  // Send alerts if any
  if (alerts.length > 0) {
    await sendAlert(alerts, metrics, correlationId);
  }
}

/**
 * Send alert notification
 */
async function sendAlert(alerts: string[], metrics: RateLimitMetrics, correlationId: string): Promise<void> {
  try {
    const message = {
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      service: 'hlekkr-auth',
      alertType: 'RATE_LIMIT_VIOLATION',
      correlationId,
      alerts,
      metrics: {
        totalUsers: metrics.totalUsers,
        activeUsers: metrics.activeUsers,
        violations: metrics.rateLimitViolations,
        topViolators: metrics.topViolators.slice(0, 5),
      },
    };
    
    await snsClient.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: `[${ENVIRONMENT.toUpperCase()}] Hlekkr Rate Limit Alert`,
      Message: JSON.stringify(message, null, 2),
    }));
    
    console.log('Alert sent successfully', { correlationId, alertCount: alerts.length });
    
  } catch (error) {
    console.error('Error sending alert:', error, { correlationId });
  }
}

/**
 * Send error alert
 */
async function sendErrorAlert(error: Error, correlationId: string): Promise<void> {
  try {
    const message = {
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      service: 'hlekkr-auth',
      alertType: 'MONITORING_ERROR',
      correlationId,
      error: {
        message: error.message,
        stack: error.stack,
      },
    };
    
    await snsClient.send(new PublishCommand({
      TopicArn: ALERTS_TOPIC_ARN,
      Subject: `[${ENVIRONMENT.toUpperCase()}] Hlekkr Rate Limit Monitor Error`,
      Message: JSON.stringify(message, null, 2),
    }));
    
  } catch (alertError) {
    console.error('Error sending error alert:', alertError, { correlationId });
  }
}