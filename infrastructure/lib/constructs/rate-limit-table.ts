import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface RateLimitTableProps {
  environment: string;
  removalPolicy: cdk.RemovalPolicy;
}

export class RateLimitTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: RateLimitTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `hlekkr-rate-limit-${props.environment}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'endpoint', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      timeToLiveAttribute: 'ttl',
      removalPolicy: props.removalPolicy
    });

    // Add GSI for time-based queries
    this.table.addGlobalSecondaryIndex({
      indexName: 'TimeIndex',
      partitionKey: { name: 'endpoint', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING }
    });
  }
}