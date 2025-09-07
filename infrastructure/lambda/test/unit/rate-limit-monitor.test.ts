import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScheduledEvent, Context } from 'aws-lambda';
import { handler } from '../../monitoring/rate-limit-monitor';

// Mock AWS SDK
vi.mock('@aws-sdk/client-dynamodb');
vi.mock('@aws-sdk/client-sns');
vi.mock('@aws-sdk/client-cloudwatch');

// Mock environment variables
process.env.RATE_LIMIT_TABLE = 'test-rate-limit-table';
process.env.USER_PROFILES_TABLE = 'test-user-profiles-table';
process.env.ALERTS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-alerts';
process.env.ENVIRONMENT = 'test';

describe('Rate Limit Monitor', () => {
  let mockEvent: ScheduledEvent;
  let mockContext: Context;
  let mockDynamoClient: any;
  let mockSNSClient: any;
  let mockCloudWatchClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AWS clients
    mockDynamoClient = {
      send: vi.fn(),
    };

    mockSNSClient = {
      send: vi.fn(),
    };

    mockCloudWatchClient = {
      send: vi.fn(),
    };

    vi.doMock('@aws-sdk/client-dynamodb', () => ({
      DynamoDBClient: vi.fn(() => mockDynamoClient),
      ScanCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-sns', () => ({
      SNSClient: vi.fn(() => mockSNSClient),
      PublishCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/client-cloudwatch', () => ({
      CloudWatchClient: vi.fn(() => mockCloudWatchClient),
      PutMetricDataCommand: vi.fn(),
    }));

    vi.doMock('@aws-sdk/util-dynamodb', () => ({
      unmarshall: vi.fn((obj) => obj),
    }));

    // Create mock scheduled event
    mockEvent = {
      version: '0',
      id: 'test-event-id',
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: new Date().toISOString(),
      region: 'us-east-1',
      detail: {},
    } as ScheduledEvent;

    mockContext = {
      awsRequestId: 'test-correlation-id',
      functionName: 'test-function',
      getRemainingTimeInMillis: () => 30000,
    } as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Successful Monitoring', () => {
    it('should successfully collect and process rate limit metrics', async () => {
      // Arrange
      const mockRateLimitData = [
        {
          rateLimitKey: 'user1:GET:/media',
          userId: 'user1',
          minuteRequests: 30,
          hourRequests: 500,
          dayRequests: 2000,
          lastRequest: new Date().toISOString(),
          burstCount: 5,
        },
        {
          rateLimitKey: 'user2:POST:/review',
          userId: 'user2',
          minuteRequests: 10,
          hourRequests: 200,
          dayRequests: 800,
          lastRequest: new Date().toISOString(),
          burstCount: 2,
        },
      ];

      const mockUserProfiles = [
        {
          userId: 'user1',
          email: 'user1@example.com',
          role: 'user',
          isActive: true,
        },
        {
          userId: 'user2',
          email: 'user2@example.com',
          role: 'moderator',
          isActive: true,
        },
      ];

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData }) // Rate limit scan
        .mockResolvedValueOnce({ Items: mockUserProfiles }); // User profiles scan

      mockCloudWatchClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      // Verify DynamoDB scans were called
      expect(mockDynamoClient.send).toHaveBeenCalledTimes(2);
      
      // Verify CloudWatch metrics were sent
      expect(mockCloudWatchClient.send).toHaveBeenCalled();
      
      // Verify no alerts were sent (normal usage)
      expect(mockSNSClient.send).not.toHaveBeenCalled();
    });

    it('should send CloudWatch metrics with correct structure', async () => {
      // Arrange
      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      mockCloudWatchClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockCloudWatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Namespace: 'Hlekkr/Authentication',
            MetricData: expect.arrayContaining([
              expect.objectContaining({
                MetricName: 'TotalUsers',
                Value: expect.any(Number),
                Unit: 'Count',
                Dimensions: expect.arrayContaining([
                  { Name: 'Environment', Value: 'test' },
                  { Name: 'Service', Value: 'hlekkr-auth' },
                ]),
              }),
              expect.objectContaining({
                MetricName: 'ActiveUsers',
                Value: expect.any(Number),
                Unit: 'Count',
              }),
              expect.objectContaining({
                MetricName: 'RateLimitViolations',
                Value: expect.any(Number),
                Unit: 'Count',
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('Alert Generation', () => {
    it('should send alert for high rate limit violations', async () => {
      // Arrange - Create scenario with many violations
      const mockRateLimitData = Array.from({ length: 150 }, (_, i) => ({
        rateLimitKey: `user${i}:GET:/media`,
        userId: `user${i}`,
        minuteRequests: 100, // Exceeds limit
        hourRequests: 2000,
        dayRequests: 5000,
        lastRequest: new Date().toISOString(),
        burstCount: 15,
      }));

      const mockUserProfiles = Array.from({ length: 150 }, (_, i) => ({
        userId: `user${i}`,
        email: `user${i}@example.com`,
        role: 'user',
        isActive: true,
      }));

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockCloudWatchClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockSNSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TopicArn: 'arn:aws:sns:us-east-1:123456789012:test-alerts',
            Subject: '[TEST] Hlekkr Rate Limit Alert',
            Message: expect.stringContaining('High rate limit violations detected'),
          }),
        })
      );
    });

    it('should send alert for suspicious user activity', async () => {
      // Arrange - Create scenario with one user having excessive violations
      const mockRateLimitData = Array.from({ length: 60 }, (_, i) => ({
        rateLimitKey: `suspicious-user:GET:/media${i}`,
        userId: 'suspicious-user',
        minuteRequests: 100, // Exceeds limit
        hourRequests: 2000,
        dayRequests: 5000,
        lastRequest: new Date().toISOString(),
        burstCount: 15,
      }));

      const mockUserProfiles = [
        {
          userId: 'suspicious-user',
          email: 'suspicious@example.com',
          role: 'user',
          isActive: true,
        },
      ];

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockCloudWatchClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockSNSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Message: expect.stringContaining('Suspicious user activity detected'),
          }),
        })
      );
    });

    it('should send alert for endpoint-specific violations', async () => {
      // Arrange - Create scenario with high violations on specific endpoint
      const mockRateLimitData = Array.from({ length: 250 }, (_, i) => ({
        rateLimitKey: `user${i}:POST:/media`,
        userId: `user${i}`,
        minuteRequests: 100, // Exceeds limit
        hourRequests: 2000,
        dayRequests: 5000,
        lastRequest: new Date().toISOString(),
        burstCount: 15,
      }));

      const mockUserProfiles = Array.from({ length: 250 }, (_, i) => ({
        userId: `user${i}`,
        email: `user${i}@example.com`,
        role: 'user',
        isActive: true,
      }));

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockCloudWatchClient.send.mockResolvedValue({});
      mockSNSClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockSNSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Message: expect.stringContaining('High violations on endpoint POST:/media'),
          }),
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle DynamoDB scan errors gracefully', async () => {
      // Arrange
      mockDynamoClient.send.mockRejectedValue(new Error('DynamoDB scan failed'));
      mockSNSClient.send.mockResolvedValue({});

      // Act & Assert
      await expect(handler(mockEvent, mockContext)).rejects.toThrow('DynamoDB scan failed');
      
      // Verify error alert was sent
      expect(mockSNSClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Subject: '[TEST] Hlekkr Rate Limit Monitor Error',
            Message: expect.stringContaining('DynamoDB scan failed'),
          }),
        })
      );
    });

    it('should handle CloudWatch errors gracefully', async () => {
      // Arrange
      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: [] })
        .mockResolvedValueOnce({ Items: [] });

      mockCloudWatchClient.send.mockRejectedValue(new Error('CloudWatch error'));

      // Act
      await handler(mockEvent, mockContext);

      // Assert - Should not throw error, just log it
      expect(mockCloudWatchClient.send).toHaveBeenCalled();
    });

    it('should handle SNS alert errors gracefully', async () => {
      // Arrange - Create high violation scenario
      const mockRateLimitData = Array.from({ length: 150 }, (_, i) => ({
        rateLimitKey: `user${i}:GET:/media`,
        userId: `user${i}`,
        minuteRequests: 100,
        hourRequests: 2000,
        dayRequests: 5000,
        lastRequest: new Date().toISOString(),
        burstCount: 15,
      }));

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: [] });

      mockCloudWatchClient.send.mockResolvedValue({});
      mockSNSClient.send.mockRejectedValue(new Error('SNS error'));

      // Act
      await handler(mockEvent, mockContext);

      // Assert - Should not throw error, just log it
      expect(mockSNSClient.send).toHaveBeenCalled();
    });
  });

  describe('Data Processing', () => {
    it('should correctly identify active users', async () => {
      // Arrange
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();

      const mockRateLimitData = [
        {
          rateLimitKey: 'active-user:GET:/media',
          userId: 'active-user',
          minuteRequests: 10,
          hourRequests: 100,
          dayRequests: 500,
          lastRequest: oneHourAgo, // Active within last hour
          burstCount: 2,
        },
        {
          rateLimitKey: 'inactive-user:GET:/media',
          userId: 'inactive-user',
          minuteRequests: 5,
          hourRequests: 50,
          dayRequests: 200,
          lastRequest: twoHoursAgo, // Not active within last hour
          burstCount: 1,
        },
      ];

      const mockUserProfiles = [
        { userId: 'active-user', email: 'active@example.com' },
        { userId: 'inactive-user', email: 'inactive@example.com' },
      ];

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockCloudWatchClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockCloudWatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            MetricData: expect.arrayContaining([
              expect.objectContaining({
                MetricName: 'ActiveUsers',
                Value: 1, // Only one active user
              }),
            ]),
          }),
        })
      );
    });

    it('should correctly calculate endpoint metrics', async () => {
      // Arrange
      const mockRateLimitData = [
        {
          rateLimitKey: 'user1:GET:/media',
          userId: 'user1',
          minuteRequests: 10,
          hourRequests: 100,
          dayRequests: 500,
          lastRequest: new Date().toISOString(),
          burstCount: 2,
        },
        {
          rateLimitKey: 'user2:GET:/media',
          userId: 'user2',
          minuteRequests: 15,
          hourRequests: 150,
          dayRequests: 750,
          lastRequest: new Date().toISOString(),
          burstCount: 3,
        },
      ];

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: [] });

      mockCloudWatchClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockCloudWatchClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            MetricData: expect.arrayContaining([
              expect.objectContaining({
                MetricName: 'EndpointRequests',
                Value: 1250, // Combined requests for GET:/media endpoint
                Dimensions: expect.arrayContaining([
                  { Name: 'Endpoint', Value: 'GET:/media' },
                ]),
              }),
            ]),
          }),
        })
      );
    });
  });

  describe('Alert Thresholds', () => {
    it('should not send alerts when below thresholds', async () => {
      // Arrange - Normal usage scenario
      const mockRateLimitData = [
        {
          rateLimitKey: 'user1:GET:/media',
          userId: 'user1',
          minuteRequests: 30, // Below violation threshold
          hourRequests: 500,
          dayRequests: 2000,
          lastRequest: new Date().toISOString(),
          burstCount: 5,
        },
      ];

      const mockUserProfiles = [
        {
          userId: 'user1',
          email: 'user1@example.com',
          role: 'user',
          isActive: true,
        },
      ];

      mockDynamoClient.send
        .mockResolvedValueOnce({ Items: mockRateLimitData })
        .mockResolvedValueOnce({ Items: mockUserProfiles });

      mockCloudWatchClient.send.mockResolvedValue({});

      // Act
      await handler(mockEvent, mockContext);

      // Assert
      expect(mockSNSClient.send).not.toHaveBeenCalled();
    });
  });
});