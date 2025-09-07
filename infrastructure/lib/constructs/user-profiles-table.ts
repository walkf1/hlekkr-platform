import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface UserProfilesTableProps {
  environment: 'dev' | 'staging' | 'prod';
  removalPolicy?: cdk.RemovalPolicy;
}

export class UserProfilesTable extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: UserProfilesTableProps) {
    super(scope, id);

    this.table = new dynamodb.Table(this, 'UserProfilesTable', {
      tableName: `hlekkr-${props.environment}-user-profiles`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: props.environment === 'prod',
      removalPolicy: props.removalPolicy || (props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY),
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      
      // Global Secondary Indexes for efficient querying
      globalSecondaryIndexes: [
        {
          indexName: 'EmailIndex',
          partitionKey: {
            name: 'email',
            type: dynamodb.AttributeType.STRING,
          },
          projectionType: dynamodb.ProjectionType.ALL,
        },
        {
          indexName: 'RoleIndex',
          partitionKey: {
            name: 'role',
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: 'createdAt',
            type: dynamodb.AttributeType.STRING,
          },
          projectionType: dynamodb.ProjectionType.ALL,
        },
        {
          indexName: 'OrganizationIndex',
          partitionKey: {
            name: 'organization',
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: 'role',
            type: dynamodb.AttributeType.STRING,
          },
          projectionType: dynamodb.ProjectionType.ALL,
        },
        {
          indexName: 'StatusIndex',
          partitionKey: {
            name: 'isActive',
            type: dynamodb.AttributeType.STRING,
          },
          sortKey: {
            name: 'lastLoginAt',
            type: dynamodb.AttributeType.STRING,
          },
          projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        },
      ],
    });

    // Add tags for resource management
    cdk.Tags.of(this.table).add('Environment', props.environment);
    cdk.Tags.of(this.table).add('Service', 'hlekkr-auth');
    cdk.Tags.of(this.table).add('Component', 'user-profiles');
  }
}

// TypeScript interfaces for type safety
export interface UserProfile {
  userId: string;
  email: string;
  role: 'user' | 'moderator' | 'admin' | 'super_admin';
  organization?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  
  // Personal Information
  givenName: string;
  familyName: string;
  phoneNumber?: string;
  profilePicture?: string;
  
  // Preferences
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string;
    notifications: {
      email: boolean;
      sms: boolean;
      push: boolean;
      analysisComplete: boolean;
      reviewAssigned: boolean;
      threatDetected: boolean;
    };
    dashboard: {
      defaultView: 'grid' | 'list';
      itemsPerPage: number;
      autoRefresh: boolean;
      refreshInterval: number;
    };
  };
  
  // Permissions and Access Control
  permissions: {
    canUploadMedia: boolean;
    canViewAnalysis: boolean;
    canModerateContent: boolean;
    canManageUsers: boolean;
    canAccessApi: boolean;
    canExportData: boolean;
    canViewReports: boolean;
    canManageSystem: boolean;
    maxUploadSize: number; // in bytes
    maxUploadsPerDay: number;
    allowedFileTypes: string[];
  };
  
  // Usage Statistics
  statistics: {
    totalUploads: number;
    totalAnalyses: number;
    totalReviews: number;
    storageUsed: number; // in bytes
    lastUploadAt?: string;
    lastAnalysisAt?: string;
    lastReviewAt?: string;
  };
  
  // Security and Audit
  security: {
    passwordLastChanged?: string;
    failedLoginAttempts: number;
    lastFailedLoginAt?: string;
    accountLockedUntil?: string;
    trustedDevices: Array<{
      deviceId: string;
      deviceName: string;
      lastUsed: string;
      ipAddress: string;
      userAgent: string;
    }>;
    loginHistory: Array<{
      timestamp: string;
      ipAddress: string;
      userAgent: string;
      success: boolean;
      location?: string;
    }>;
  };
  
  // Compliance and Legal
  compliance: {
    termsAcceptedAt?: string;
    privacyPolicyAcceptedAt?: string;
    dataRetentionConsent: boolean;
    marketingConsent: boolean;
    gdprConsent?: {
      consentGiven: boolean;
      consentDate: string;
      consentVersion: string;
    };
  };
}

export interface CreateUserProfileRequest {
  userId: string;
  email: string;
  givenName: string;
  familyName: string;
  role?: 'user' | 'moderator' | 'admin';
  organization?: string;
  phoneNumber?: string;
}

export interface UpdateUserProfileRequest {
  userId: string;
  updates: Partial<Omit<UserProfile, 'userId' | 'createdAt'>>;
}

export interface UserProfileQueryOptions {
  role?: string;
  organization?: string;
  isActive?: boolean;
  limit?: number;
  lastEvaluatedKey?: Record<string, any>;
}