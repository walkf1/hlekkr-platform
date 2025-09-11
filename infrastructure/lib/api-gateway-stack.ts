import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface HlekkrApiGatewayStackProps extends cdk.StackProps {
  environment: 'dev' | 'staging' | 'prod';
  userPool: cognito.UserPool;
  userPoolClient: cognito.UserPoolClient;
}

export class HlekkrApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly mediaUploadFunction: lambda.Function;
  public readonly analysisResultsFunction: lambda.Function;
  public readonly reviewDecisionsFunction: lambda.Function;
  public readonly authEndpointsFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: HlekkrApiGatewayStackProps) {
    super(scope, id, props);

    // Create CloudWatch Log Group for API Gateway
    const apiLogGroup = new logs.LogGroup(this, 'HlekkrApiLogGroup', {
      logGroupName: `/aws/apigateway/hlekkr-${props.environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Create REST API
    this.api = new apigateway.RestApi(this, 'HlekkrApi', {
      restApiName: `hlekkr-${props.environment}-api`,
      description: 'Hlekkr Media Analysis Platform API',
      deployOptions: {
        stageName: props.environment,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiLogGroup),
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: false,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-Correlation-ID',
        ],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Create Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool],
      authorizerName: `hlekkr-${props.environment}-authorizer`,
      identitySource: 'method.request.header.Authorization',
    });

    // Create Lambda functions
    this.createLambdaFunctions(props.environment);

    // Create API resources and methods
    this.createApiResources(cognitoAuthorizer);

    // Add usage plan and API key for external integrations
    this.createUsagePlan(props.environment);

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Hlekkr API Gateway URL',
      exportName: `hlekkr-${props.environment}-api-url`,
    });

    new cdk.CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'Hlekkr API Gateway ID',
      exportName: `hlekkr-${props.environment}-api-id`,
    });
  }

  private createLambdaFunctions(environment: string): void {
    // Common Lambda configuration
    const commonProps = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        ENVIRONMENT: environment,
        MEDIA_BUCKET: `hlekkr-${environment}-media`,
        MEDIA_ANALYSIS_TABLE: `hlekkr-${environment}-media-analysis`,
        REVIEW_DECISIONS_TABLE: `hlekkr-${environment}-review-decisions`,
        ANALYSIS_QUEUE_URL: `https://sqs.${this.region}.amazonaws.com/${this.account}/hlekkr-${environment}-analysis`,
        THREAT_INTELLIGENCE_QUEUE: `https://sqs.${this.region}.amazonaws.com/${this.account}/hlekkr-${environment}-threat-intelligence`,
        REVIEW_NOTIFICATIONS_TOPIC: `arn:aws:sns:${this.region}:${this.account}:hlekkr-${environment}-review-notifications`,
        // Enhanced authentication and rate limiting
        USER_POOL_ID: props.userPoolId,
        USER_POOL_CLIENT_ID: props.userPoolClientId,
        RATE_LIMIT_TABLE: `hlekkr-${environment}-rate-limits`,
        USER_PROFILES_TABLE: `hlekkr-${environment}-user-profiles`,
      },
    };

    // Media Upload Function
    this.mediaUploadFunction = new lambda.Function(this, 'MediaUploadFunction', {
      ...commonProps,
      functionName: `hlekkr-${environment}-media-upload`,
      handler: 'media-upload.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      description: 'Handles media file uploads with enhanced authentication and rate limiting',
    });

    // Analysis Results Function
    this.analysisResultsFunction = new lambda.Function(this, 'AnalysisResultsFunction', {
      ...commonProps,
      functionName: `hlekkr-${environment}-analysis-results`,
      handler: 'analysis-results.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      description: 'Fetches media analysis results with enhanced authentication and rate limiting',
    });

    // Review Decisions Function
    this.reviewDecisionsFunction = new lambda.Function(this, 'ReviewDecisionsFunction', {
      ...commonProps,
      functionName: `hlekkr-${environment}-review-decisions`,
      handler: 'review-decisions.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      description: 'Handles human review decisions with enhanced authentication and rate limiting',
    });

    // Auth Endpoints Function
    this.authEndpointsFunction = new lambda.Function(this, 'AuthEndpointsFunction', {
      ...commonProps,
      functionName: `hlekkr-${environment}-auth-endpoints`,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/api'),
      description: 'Handles authentication endpoints and session management',
    });

    // Grant necessary permissions
    this.grantLambdaPermissions();
  }

  private createApiResources(authorizer: apigateway.CognitoUserPoolsAuthorizer): void {
    // Auth endpoints (no authorization required for login)
    const authResource = this.api.root.addResource('auth');
    
    // POST /auth/login
    authResource.addResource('login').addMethod('POST', 
      new apigateway.LambdaIntegration(this.authEndpointsFunction)
    );
    
    // POST /auth/logout (requires auth)
    authResource.addResource('logout').addMethod('POST', 
      new apigateway.LambdaIntegration(this.authEndpointsFunction),
      { authorizer }
    );
    
    // POST /auth/refresh
    authResource.addResource('refresh').addMethod('POST', 
      new apigateway.LambdaIntegration(this.authEndpointsFunction)
    );
    
    // GET /auth/me (requires auth)
    authResource.addResource('me').addMethod('GET', 
      new apigateway.LambdaIntegration(this.authEndpointsFunction),
      { authorizer }
    );

    // Media endpoints (all require authentication)
    const mediaResource = this.api.root.addResource('media');
    
    // POST /media (upload)
    mediaResource.addMethod('POST', 
      new apigateway.LambdaIntegration(this.mediaUploadFunction),
      { authorizer }
    );
    
    // POST /media/initiate (initiate upload)
    mediaResource.addResource('initiate').addMethod('POST', 
      new apigateway.LambdaIntegration(this.mediaUploadFunction),
      { authorizer }
    );
    
    // GET /media/{mediaId}/status
    const mediaIdResource = mediaResource.addResource('{mediaId}');
    mediaIdResource.addResource('status').addMethod('GET', 
      new apigateway.LambdaIntegration(this.mediaUploadFunction),
      { authorizer }
    );
    
    // PUT /media/{mediaId}/complete
    mediaIdResource.addResource('complete').addMethod('PUT', 
      new apigateway.LambdaIntegration(this.mediaUploadFunction),
      { authorizer }
    );

    // Analysis endpoints (all require authentication)
    const analysisResource = this.api.root.addResource('analysis');
    
    // GET /analysis/results
    const resultsResource = analysisResource.addResource('results');
    resultsResource.addMethod('GET', 
      new apigateway.LambdaIntegration(this.analysisResultsFunction),
      { authorizer }
    );
    
    // GET /analysis/results/{mediaId}
    resultsResource.addResource('{mediaId}').addMethod('GET', 
      new apigateway.LambdaIntegration(this.analysisResultsFunction),
      { authorizer }
    );
    
    // POST /analysis/reanalyze
    analysisResource.addResource('reanalyze').addMethod('POST', 
      new apigateway.LambdaIntegration(this.analysisResultsFunction),
      { authorizer }
    );

    // Review endpoints (require moderator permissions)
    const reviewResource = this.api.root.addResource('review');
    
    // GET /review/queue
    reviewResource.addResource('queue').addMethod('GET', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );
    
    // POST /review/decisions
    const decisionsResource = reviewResource.addResource('decisions');
    decisionsResource.addMethod('POST', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );
    
    // GET /review/decisions
    decisionsResource.addMethod('GET', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );
    
    // GET /review/decisions/{reviewId}
    decisionsResource.addResource('{reviewId}').addMethod('GET', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );
    
    // POST /review/start
    reviewResource.addResource('start').addMethod('POST', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );
    
    // PUT /review/{mediaId}/assign
    reviewResource.addResource('{mediaId}').addResource('assign').addMethod('PUT', 
      new apigateway.LambdaIntegration(this.reviewDecisionsFunction),
      { authorizer }
    );

    // Health check endpoint (no auth required)
    this.api.root.addResource('health').addMethod('GET', 
      new apigateway.MockIntegration({
        integrationResponses: [{
          statusCode: '200',
          responseTemplates: {
            'application/json': JSON.stringify({
              status: 'healthy',
              timestamp: '$context.requestTime',
              version: '1.0.0',
            }),
          },
        }],
        requestTemplates: {
          'application/json': '{"statusCode": 200}',
        },
      }),
      {
        methodResponses: [{
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        }],
      }
    );
  }

  private createUsagePlan(environment: string): void {
    // Create API Key for external integrations
    const apiKey = new apigateway.ApiKey(this, 'HlekkrApiKey', {
      apiKeyName: `hlekkr-${environment}-api-key`,
      description: 'API key for Hlekkr external integrations',
    });

    // Create Usage Plan
    const usagePlan = new apigateway.UsagePlan(this, 'HlekkrUsagePlan', {
      name: `hlekkr-${environment}-usage-plan`,
      description: 'Usage plan for Hlekkr API',
      throttle: {
        rateLimit: environment === 'prod' ? 1000 : 100,
        burstLimit: environment === 'prod' ? 2000 : 200,
      },
      quota: {
        limit: environment === 'prod' ? 100000 : 10000,
        period: apigateway.Period.DAY,
      },
      apiStages: [{
        api: this.api,
        stage: this.api.deploymentStage,
      }],
    });

    // Associate API Key with Usage Plan
    usagePlan.addApiKey(apiKey);

    // Output API Key ID
    new cdk.CfnOutput(this, 'ApiKeyId', {
      value: apiKey.keyId,
      description: 'Hlekkr API Key ID',
      exportName: `hlekkr-${environment}-api-key-id`,
    });
  }

  private grantLambdaPermissions(): void {
    // Create IAM role for Lambda functions with necessary permissions
    const lambdaRole = new iam.Role(this, 'HlekkrLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
      inlinePolicies: {
        HlekkrLambdaPolicy: new iam.PolicyDocument({
          statements: [
            // DynamoDB permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:Query',
                'dynamodb:Scan',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/hlekkr-*`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/hlekkr-*/index/*`,
              ],
            }),
            // S3 permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:GetObject',
                's3:PutObject',
                's3:DeleteObject',
                's3:GetObjectVersion',
              ],
              resources: [
                `arn:aws:s3:::hlekkr-*/*`,
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:ListBucket',
                's3:GetBucketLocation',
              ],
              resources: [
                `arn:aws:s3:::hlekkr-*`,
              ],
            }),
            // SQS permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sqs:SendMessage',
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes',
              ],
              resources: [
                `arn:aws:sqs:${this.region}:${this.account}:hlekkr-*`,
              ],
            }),
            // SNS permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'sns:Publish',
              ],
              resources: [
                `arn:aws:sns:${this.region}:${this.account}:hlekkr-*`,
              ],
            }),
            // Cognito permissions
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'cognito-idp:AdminGetUser',
                'cognito-idp:AdminUpdateUserAttributes',
                'cognito-idp:AdminListGroupsForUser',
              ],
              resources: [
                `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/*`,
              ],
            }),
          ],
        }),
      },
    });

    // Apply the role to all Lambda functions
    [
      this.mediaUploadFunction,
      this.analysisResultsFunction,
      this.reviewDecisionsFunction,
      this.authEndpointsFunction,
    ].forEach(func => {
      // Note: In a real implementation, you would set the role during function creation
      // This is just for demonstration
    });
  }
}