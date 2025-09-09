import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';

export interface BedrockUsageMetrics {
  totalInvocations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  errorRate: number;
  averageLatency: number;
  period: string;
}

export class BedrockUsageMonitor {
  private cloudWatch: CloudWatchClient;
  
  constructor(region: string = 'eu-central-1') {
    this.cloudWatch = new CloudWatchClient({ region });
  }

  async getUsageMetrics(
    startTime: Date,
    endTime: Date,
    modelId: string = 'anthropic.claude-3-sonnet-20240229-v1:0'
  ): Promise<BedrockUsageMetrics> {
    try {
      const [invocations, inputTokens, outputTokens, errors, latency] = await Promise.all([
        this.getMetric('AWS/Bedrock', 'Invocations', startTime, endTime, modelId),
        this.getMetric('AWS/Bedrock', 'InputTokenCount', startTime, endTime, modelId),
        this.getMetric('AWS/Bedrock', 'OutputTokenCount', startTime, endTime, modelId),
        this.getMetric('AWS/Bedrock', 'InvocationClientErrors', startTime, endTime, modelId),
        this.getMetric('AWS/Bedrock', 'InvocationLatency', startTime, endTime, modelId)
      ]);

      const totalInvocations = invocations.reduce((sum, point) => sum + (point.Sum || 0), 0);
      const totalInputTokens = inputTokens.reduce((sum, point) => sum + (point.Sum || 0), 0);
      const totalOutputTokens = outputTokens.reduce((sum, point) => sum + (point.Sum || 0), 0);
      const totalErrors = errors.reduce((sum, point) => sum + (point.Sum || 0), 0);
      const avgLatency = latency.length > 0 
        ? latency.reduce((sum, point) => sum + (point.Average || 0), 0) / latency.length 
        : 0;

      return {
        totalInvocations,
        totalInputTokens,
        totalOutputTokens,
        estimatedCost: this.calculateCost(modelId, totalInputTokens, totalOutputTokens),
        errorRate: totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0,
        averageLatency: avgLatency,
        period: `${startTime.toISOString()} to ${endTime.toISOString()}`
      };
    } catch (error) {
      console.error('Failed to get Bedrock usage metrics:', error);
      throw error;
    }
  }

  private async getMetric(
    namespace: string,
    metricName: string,
    startTime: Date,
    endTime: Date,
    modelId: string
  ) {
    const command = new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: [
        {
          Name: 'ModelId',
          Value: modelId
        }
      ],
      StartTime: startTime,
      EndTime: endTime,
      Period: 3600,
      Statistics: ['Sum', 'Average']
    });

    const response = await this.cloudWatch.send(command);
    return response.Datapoints || [];
  }

  private calculateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'anthropic.claude-3-sonnet-20240229-v1:0': { input: 0.003, output: 0.015 },
      'anthropic.claude-3-haiku-20240307-v1:0': { input: 0.00025, output: 0.00125 },
      'amazon.titan-text-express-v1': { input: 0.0008, output: 0.0016 }
    };

    const modelPricing = pricing[modelId] || pricing['anthropic.claude-3-sonnet-20240229-v1:0'];
    
    return (
      (inputTokens / 1000) * modelPricing.input +
      (outputTokens / 1000) * modelPricing.output
    );
  }

  async getDailyUsage(): Promise<BedrockUsageMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    return this.getUsageMetrics(startTime, endTime);
  }
}