import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.StackProps {
  environment: 'dev' | 'staging' | 'prod';
  domainName?: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;
  public readonly authenticatedRole: iam.Role;
  public readonly unauthenticatedRole: iam.Role;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    // Pre-signup Lambda trigger for custom validation
    const preSignupTrigger = new lambda.Function(this, 'PreSignupTrigger', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          console.log('Pre-signup trigger:', JSON.stringify(event, null, 2));
          
          // Custom validation logic
          const { userAttributes } = event.request;
          
          // Validate email domain for admin users
          if (userAttributes.email) {
            const email = userAttributes.email;
            const domain = email.split('@')[1];
            
            // Allow specific domains for admin access
            const allowedDomains = ['hlekkr.com', 'company.com'];
            if (userAttributes['custom:role'] === 'admin' && !allowedDomains.includes(domain)) {
              throw new Error('Admin accounts must use approved email domains');
            }
          }
          
          // Auto-confirm users for development
          if (process.env.ENVIRONMENT === 'dev') {
            event.response.autoConfirmUser = true;
            event.response.autoVerifyEmail = true;
          }
          
          return event;
        };
      `),
      environment: {
        ENVIRONMENT: props.environment,
      },
    });

    // Post-confirmation Lambda trigger for user setup
    const postConfirmationTrigger = new lambda.Function(this, 'PostConfirmationTrigger', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const dynamodb = new AWS.DynamoDB.DocumentClient();
        
        exports.handler = async (event) => {
          console.log('Post-confirmation trigger:', JSON.stringify(event, null, 2));
          
          const { userAttributes, userName } = event.request;
          
          try {
            // Create user profile in DynamoDB
            await dynamodb.put({
              TableName: process.env.USER_PROFILES_TABLE,
              Item: {
                userId: userName,
                email: userAttributes.email,
                role: userAttributes['custom:role'] || 'user',
                createdAt: new Date().toISOString(),
                lastLoginAt: null,
                isActive: true,
                preferences: {
                  theme: 'light',
                  notifications: true,
                  language: 'en'
                },
                permissions: {
                  canUploadMedia: true,
                  canViewAnalysis: true,
                  canModerateContent: userAttributes['custom:role'] === 'moderator' || userAttributes['custom:role'] === 'admin',
                  canManageUsers: userAttributes['custom:role'] === 'admin'
                }
              }
            }).promise();
            
            console.log('User profile created successfully');
          } catch (error) {
            console.error('Error creating user profile:', error);
            // Don't throw error to avoid blocking user confirmation
          }
          
          return event;
        };
      `),
      environment: {
        USER_PROFILES_TABLE: `hlekkr-${props.environment}-user-profiles`,
      },
    });

    // Grant DynamoDB permissions to post-confirmation trigger
    postConfirmationTrigger.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:PutItem'],
      resources: [`arn:aws:dynamodb:${this.region}:${this.account}:table/hlekkr-${props.environment}-user-profiles`],
    }));

    // Create Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'HlekkrUserPool', {
      userPoolName: `hlekkr-${props.environment}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: true,
          mutable: true,
        },
        familyName: {
          required: true,
          mutable: true,
        },
      },
      customAttributes: {
        role: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: true,
        }),
        organization: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 100,
          mutable: true,
        }),
        permissions: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 1000,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      lambdaTriggers: {
        preSignUp: preSignupTrigger,
        postConfirmation: postConfirmationTrigger,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true,
      },
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: false,
      },
    });

    // Create User Pool Client for web application
    this.userPoolClient = new cognito.UserPoolClient(this, 'HlekkrWebClient', {
      userPool: this.userPool,
      userPoolClientName: `hlekkr-${props.environment}-web-client`,
      generateSecret: false, // Web clients don't need secrets
      authFlows: {
        userSrp: true,
        userPassword: true,
        adminUserPassword: true,
        custom: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false, // Less secure, disabled
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          props.domainName ? `https://${props.domainName}/auth/callback` : 'http://localhost:3000/auth/callback',
          props.domainName ? `https://app.${props.domainName}/auth/callback` : 'http://localhost:3000/auth/callback',
        ],
        logoutUrls: [
          props.domainName ? `https://${props.domainName}/auth/logout` : 'http://localhost:3000/auth/logout',
          props.domainName ? `https://app.${props.domainName}/auth/logout` : 'http://localhost:3000/auth/logout',
        ],
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      enableTokenRevocation: true,
    });

    // Create User Pool Client for mobile/API access
    const apiClient = new cognito.UserPoolClient(this, 'HlekkrApiClient', {
      userPool: this.userPool,
      userPoolClientName: `hlekkr-${props.environment}-api-client`,
      generateSecret: true, // API clients need secrets
      authFlows: {
        userSrp: true,
        userPassword: false,
        adminUserPassword: true, // For server-side operations
        custom: true,
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: cdk.Duration.days(30),
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      enableTokenRevocation: true,
    });

    // Create Identity Pool for AWS resource access
    this.identityPool = new cognito.CfnIdentityPool(this, 'HlekkrIdentityPool', {
      identityPoolName: `hlekkr_${props.environment}_identity_pool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
          serverSideTokenCheck: true,
        },
      ],
    });

    // Create IAM roles for authenticated users
    this.authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      roleName: `hlekkr-${props.environment}-authenticated-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        AuthenticatedUserPolicy: new iam.PolicyDocument({
          statements: [
            // S3 permissions for media upload
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:PutObjectAcl',
                's3:GetObject',
              ],
              resources: [
                `arn:aws:s3:::hlekkr-${props.environment}-media-upload/users/\${cognito-identity.amazonaws.com:sub}/*`,
              ],
            }),
            // DynamoDB permissions for user data
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:GetItem',
                'dynamodb:PutItem',
                'dynamodb:UpdateItem',
                'dynamodb:Query',
              ],
              resources: [
                `arn:aws:dynamodb:${this.region}:${this.account}:table/hlekkr-${props.environment}-user-profiles`,
                `arn:aws:dynamodb:${this.region}:${this.account}:table/hlekkr-${props.environment}-media-analysis`,
              ],
              conditions: {
                'ForAllValues:StringEquals': {
                  'dynamodb:LeadingKeys': ['${cognito-identity.amazonaws.com:sub}'],
                },
              },
            }),
          ],
        }),
      },
    });

    // Create IAM role for unauthenticated users (minimal permissions)
    this.unauthenticatedRole = new iam.Role(this, 'UnauthenticatedRole', {
      roleName: `hlekkr-${props.environment}-unauthenticated-role`,
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': this.identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'unauthenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      inlinePolicies: {
        UnauthenticatedUserPolicy: new iam.PolicyDocument({
          statements: [
            // Very limited permissions for unauthenticated users
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['cognito-identity:GetId'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Attach roles to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: this.authenticatedRole.roleArn,
        unauthenticated: this.unauthenticatedRole.roleArn,
      },
    });

    // Create User Pool Domain for hosted UI
    const userPoolDomain = new cognito.UserPoolDomain(this, 'HlekkrUserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: `hlekkr-${props.environment}-auth`,
      },
    });

    // Store configuration in SSM Parameter Store
    new ssm.StringParameter(this, 'UserPoolIdParameter', {
      parameterName: `/hlekkr/${props.environment}/auth/user-pool-id`,
      stringValue: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for Hlekkr authentication',
    });

    new ssm.StringParameter(this, 'UserPoolClientIdParameter', {
      parameterName: `/hlekkr/${props.environment}/auth/user-pool-client-id`,
      stringValue: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for web application',
    });

    new ssm.StringParameter(this, 'ApiClientIdParameter', {
      parameterName: `/hlekkr/${props.environment}/auth/api-client-id`,
      stringValue: apiClient.userPoolClientId,
      description: 'Cognito User Pool Client ID for API access',
    });

    new ssm.StringParameter(this, 'IdentityPoolIdParameter', {
      parameterName: `/hlekkr/${props.environment}/auth/identity-pool-id`,
      stringValue: this.identityPool.ref,
      description: 'Cognito Identity Pool ID for AWS resource access',
    });

    new ssm.StringParameter(this, 'AuthDomainParameter', {
      parameterName: `/hlekkr/${props.environment}/auth/domain`,
      stringValue: userPoolDomain.domainName,
      description: 'Cognito User Pool Domain for hosted UI',
    });

    // Output important values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `hlekkr-${props.environment}-user-pool-id`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `hlekkr-${props.environment}-user-pool-client-id`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `hlekkr-${props.environment}-identity-pool-id`,
    });

    new cdk.CfnOutput(this, 'AuthDomain', {
      value: `${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain',
      exportName: `hlekkr-${props.environment}-auth-domain`,
    });
  }
}