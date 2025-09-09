import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as organizations from 'aws-cdk-lib/aws-organizations';
import { Construct } from 'constructs';

export interface HlekkrOrgStackProps extends cdk.StackProps {
  organizationId: string;
  targetAccountId?: string;
}

export class HlekkrOrgStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: HlekkrOrgStackProps) {
    super(scope, id, props);

    // Organization-aware resource naming
    const orgPrefix = `hlekkr-org-${props.organizationId.split('-')[1]}`;
    
    // S3 bucket with organization context
    const mediaUploadsBucket = new s3.Bucket(this, 'HlekkrOrgMediaUploads', {
      bucketName: `${orgPrefix}-media-${this.account}-${this.region}`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [{
        allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.POST, s3.HttpMethods.PUT],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
        maxAge: 3000
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // DynamoDB with organization context
    const auditTable = new dynamodb.Table(this, 'HlekkrOrgAuditTable', {
      tableName: `${orgPrefix}-audit-${this.account}-${this.region}`,
      partitionKey: { name: 'mediaId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Lambda functions
    const healthCheckFunction = new lambda.Function(this, 'HlekkrOrgHealthCheck', {
      functionName: `${orgPrefix}-health-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              message: 'Hlekkr Platform (Organization Deployment)',
              organizationId: '${props.organizationId}',
              accountId: '${this.account}',
              region: '${this.region}',
              timestamp: new Date().toISOString(),
              version: '1.0.0-org'
            })
          };
        };
      `),
      environment: {
        ORGANIZATION_ID: props.organizationId,
        MEDIA_BUCKET_NAME: mediaUploadsBucket.bucketName,
        AUDIT_TABLE_NAME: auditTable.tableName
      }
    });

    const mediaUploadFunction = new lambda.Function(this, 'HlekkrOrgMediaUpload', {
      functionName: `${orgPrefix}-upload-${this.account}-${this.region}`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'media-upload.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      timeout: cdk.Duration.minutes(5),
      environment: {
        ORGANIZATION_ID: props.organizationId,
        MEDIA_BUCKET_NAME: mediaUploadsBucket.bucketName,
        AUDIT_TABLE_NAME: auditTable.tableName
      }
    });

    // Grant permissions
    mediaUploadsBucket.grantRead(healthCheckFunction);
    auditTable.grantReadData(healthCheckFunction);
    mediaUploadsBucket.grantReadWrite(mediaUploadFunction);
    auditTable.grantWriteData(mediaUploadFunction);

    // API Gateway
    const api = new apigateway.RestApi(this, 'HlekkrOrgApi', {
      restApiName: `${orgPrefix}-api-${this.account}-${this.region}`,
      description: 'Hlekkr Platform API (Organization Deployment)',
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL]
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
      }
    });

    const healthResource = api.root.addResource('health');
    healthResource.addMethod('GET', new apigateway.LambdaIntegration(healthCheckFunction));

    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(mediaUploadFunction));

    // Outputs
    new cdk.CfnOutput(this, 'OrganizationId', {
      value: props.organizationId,
      description: 'AWS Organization ID'
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Hlekkr Organization API Gateway URL'
    });

    new cdk.CfnOutput(this, 'MediaBucketName', {
      value: mediaUploadsBucket.bucketName,
      description: 'Organization media uploads S3 bucket'
    });
  }
}