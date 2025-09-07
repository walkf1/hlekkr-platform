import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CognitoIdentityProviderClient, InitiateAuthCommand, RespondToAuthChallengeCommand, GlobalSignOutCommand, AdminInitiateAuthCommand, AdminRespondToAuthChallengeCommand, ChangePasswordCommand, ForgotPasswordCommand, ConfirmForgotPasswordCommand, SetUserMFAPreferenceCommand, AssociateSoftwareTokenCommand, VerifySoftwareTokenCommand } from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { AuthMiddleware, AuthError } from './auth-middleware';

// Initialize AWS clients
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION });

// Environment variables
const USER_POOL_ID = process.env.USER_POOL_ID!;
const USER_POOL_CLIENT_ID = process.env.USER_POOL_CLIENT_ID!;
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE!;

interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface MFASetupRequest {
  accessToken: string;
}

interface MFAVerifyRequest {
  accessToken: string;
  code: string;
}

interface ChangePasswordRequest {
  accessToken: string;
  previousPassword: string;
  proposedPassword: string;
}

interface ForgotPasswordRequest {
  email: string;
}

interface ResetPasswordRequest {
  email: string;
  confirmationCode: string;
  newPassword: string;
}

/**
 * Lambda handler for session management operations
 * Handles login, logout, MFA, password changes, etc.
 */
export const handler = async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
  console.log('Session management request:', JSON.stringify(event, null, 2));
  
  const correlationId = context.awsRequestId;
  
  try {
    const { httpMethod, path, body } = event;
    const pathSegments = path.split('/').filter(Boolean);
    const action = pathSegments[pathSegments.length - 1];
    
    // Route to appropriate handler based on action
    switch (action) {
      case 'login':
        return await handleLogin(JSON.parse(body || '{}'), correlationId);
      
      case 'logout':
        return await handleLogout(event, context, correlationId);
      
      case 'refresh':
        return await handleRefreshToken(JSON.parse(body || '{}'), correlationId);
      
      case 'change-password':
        return await handleChangePassword(JSON.parse(body || '{}'), correlationId);
      
      case 'forgot-password':
        return await handleForgotPassword(JSON.parse(body || '{}'), correlationId);
      
      case 'reset-password':
        return await handleResetPassword(JSON.parse(body || '{}'), correlationId);
      
      case 'setup-mfa':
        return await handleMFASetup(JSON.parse(body || '{}'), correlationId);
      
      case 'verify-mfa':
        return await handleMFAVerify(JSON.parse(body || '{}'), correlationId);
      
      case 'disable-mfa':
        return await handleMFADisable(event, context, correlationId);
      
      case 'session-info':
        return await handleSessionInfo(event, context, correlationId);
      
      default:
        return createErrorResponse(404, 'Endpoint not found', correlationId);
    }
  } catch (error) {
    console.error('Error in session management:', error);
    
    if (error instanceof AuthError) {
      return createErrorResponse(error.statusCode, error.message, correlationId);
    }
    
    return createErrorResponse(500, 'Internal server error', correlationId);
  }
};

/**
 * Handle user login
 */
async function handleLogin(request: LoginRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { email, password, rememberMe = false } = request;
    
    if (!email || !password) {
      return createErrorResponse(400, 'Email and password are required', correlationId);
    }
    
    // Initiate authentication
    const authCommand = new InitiateAuthCommand({
      ClientId: USER_POOL_CLIENT_ID,
      AuthFlow: 'USER_SRP_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });
    
    const authResult = await cognitoClient.send(authCommand);
    
    // Handle different authentication challenges
    if (authResult.ChallengeName) {
      return handleAuthChallenge(authResult, correlationId);
    }
    
    if (!authResult.AuthenticationResult) {
      return createErrorResponse(401, 'Authentication failed', correlationId);
    }
    
    const { AccessToken, RefreshToken, IdToken, ExpiresIn } = authResult.AuthenticationResult;
    
    // Update user login statistics
    await updateLoginStatistics(email, true, correlationId);
    
    // Log successful login
    await AuthMiddleware.logSecurityEvent(
      email,
      'LOGIN_SUCCESS',
      { rememberMe, correlationId },
      correlationId
    );
    
    return createSuccessResponse({
      accessToken: AccessToken,
      refreshToken: RefreshToken,
      idToken: IdToken,
      expiresIn: ExpiresIn,
      tokenType: 'Bearer',
    }, correlationId);
  } catch (error) {
    console.error('Login error:', error);
    
    // Update failed login statistics
    if (request.email) {
      await updateLoginStatistics(request.email, false, correlationId);
    }
    
    return createErrorResponse(401, 'Invalid credentials', correlationId);
  }
}

/**
 * Handle authentication challenges (MFA, password change, etc.)
 */
async function handleAuthChallenge(authResult: any, correlationId: string): Promise<APIGatewayProxyResult> {
  const { ChallengeName, ChallengeParameters, Session } = authResult;
  
  switch (ChallengeName) {
    case 'SMS_MFA':
      return createSuccessResponse({
        challengeName: 'SMS_MFA',
        challengeParameters: ChallengeParameters,
        session: Session,
        message: 'SMS MFA code sent. Please verify with the code.',
      }, correlationId);
    
    case 'SOFTWARE_TOKEN_MFA':
      return createSuccessResponse({
        challengeName: 'SOFTWARE_TOKEN_MFA',
        challengeParameters: ChallengeParameters,
        session: Session,
        message: 'Please enter your TOTP code from your authenticator app.',
      }, correlationId);
    
    case 'NEW_PASSWORD_REQUIRED':
      return createSuccessResponse({
        challengeName: 'NEW_PASSWORD_REQUIRED',
        challengeParameters: ChallengeParameters,
        session: Session,
        message: 'New password required. Please set a new password.',
      }, correlationId);
    
    case 'MFA_SETUP':
      return createSuccessResponse({
        challengeName: 'MFA_SETUP',
        challengeParameters: ChallengeParameters,
        session: Session,
        message: 'MFA setup required. Please configure multi-factor authentication.',
      }, correlationId);
    
    default:
      return createErrorResponse(400, `Unsupported challenge: ${ChallengeName}`, correlationId);
  }
}

/**
 * Handle user logout
 */
async function handleLogout(event: APIGatewayProxyEvent, context: Context, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const auth = await AuthMiddleware.authenticate(event, context);
    
    // Global sign out from all devices
    await cognitoClient.send(new GlobalSignOutCommand({
      AccessToken: event.headers.Authorization?.replace('Bearer ', ''),
    }));
    
    // Log successful logout
    await AuthMiddleware.logSecurityEvent(
      auth.user.userId,
      'LOGOUT_SUCCESS',
      { correlationId },
      correlationId
    );
    
    return createSuccessResponse({
      message: 'Successfully logged out from all devices',
    }, correlationId);
  } catch (error) {
    console.error('Logout error:', error);
    return createErrorResponse(500, 'Failed to logout', correlationId);
  }
}

/**
 * Handle token refresh
 */
async function handleRefreshToken(request: { refreshToken: string }, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { refreshToken } = request;
    
    if (!refreshToken) {
      return createErrorResponse(400, 'Refresh token is required', correlationId);
    }
    
    const authCommand = new InitiateAuthCommand({
      ClientId: USER_POOL_CLIENT_ID,
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    });
    
    const authResult = await cognitoClient.send(authCommand);
    
    if (!authResult.AuthenticationResult) {
      return createErrorResponse(401, 'Invalid refresh token', correlationId);
    }
    
    const { AccessToken, IdToken, ExpiresIn } = authResult.AuthenticationResult;
    
    return createSuccessResponse({
      accessToken: AccessToken,
      idToken: IdToken,
      expiresIn: ExpiresIn,
      tokenType: 'Bearer',
    }, correlationId);
  } catch (error) {
    console.error('Token refresh error:', error);
    return createErrorResponse(401, 'Failed to refresh token', correlationId);
  }
}

/**
 * Handle password change
 */
async function handleChangePassword(request: ChangePasswordRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { accessToken, previousPassword, proposedPassword } = request;
    
    if (!accessToken || !previousPassword || !proposedPassword) {
      return createErrorResponse(400, 'Access token, previous password, and new password are required', correlationId);
    }
    
    await cognitoClient.send(new ChangePasswordCommand({
      AccessToken: accessToken,
      PreviousPassword: previousPassword,
      ProposedPassword: proposedPassword,
    }));
    
    return createSuccessResponse({
      message: 'Password changed successfully',
    }, correlationId);
  } catch (error) {
    console.error('Change password error:', error);
    return createErrorResponse(400, 'Failed to change password', correlationId);
  }
}

/**
 * Handle forgot password
 */
async function handleForgotPassword(request: ForgotPasswordRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { email } = request;
    
    if (!email) {
      return createErrorResponse(400, 'Email is required', correlationId);
    }
    
    await cognitoClient.send(new ForgotPasswordCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: email,
    }));
    
    return createSuccessResponse({
      message: 'Password reset code sent to your email',
    }, correlationId);
  } catch (error) {
    console.error('Forgot password error:', error);
    return createErrorResponse(400, 'Failed to send password reset code', correlationId);
  }
}

/**
 * Handle password reset
 */
async function handleResetPassword(request: ResetPasswordRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { email, confirmationCode, newPassword } = request;
    
    if (!email || !confirmationCode || !newPassword) {
      return createErrorResponse(400, 'Email, confirmation code, and new password are required', correlationId);
    }
    
    await cognitoClient.send(new ConfirmForgotPasswordCommand({
      ClientId: USER_POOL_CLIENT_ID,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
    }));
    
    return createSuccessResponse({
      message: 'Password reset successfully',
    }, correlationId);
  } catch (error) {
    console.error('Reset password error:', error);
    return createErrorResponse(400, 'Failed to reset password', correlationId);
  }
}

/**
 * Handle MFA setup
 */
async function handleMFASetup(request: MFASetupRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { accessToken } = request;
    
    if (!accessToken) {
      return createErrorResponse(400, 'Access token is required', correlationId);
    }
    
    // Associate software token (TOTP)
    const result = await cognitoClient.send(new AssociateSoftwareTokenCommand({
      AccessToken: accessToken,
    }));
    
    return createSuccessResponse({
      secretCode: result.SecretCode,
      message: 'Scan the QR code with your authenticator app and verify with a code',
    }, correlationId);
  } catch (error) {
    console.error('MFA setup error:', error);
    return createErrorResponse(400, 'Failed to setup MFA', correlationId);
  }
}

/**
 * Handle MFA verification
 */
async function handleMFAVerify(request: MFAVerifyRequest, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const { accessToken, code } = request;
    
    if (!accessToken || !code) {
      return createErrorResponse(400, 'Access token and verification code are required', correlationId);
    }
    
    // Verify software token
    await cognitoClient.send(new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: code,
    }));
    
    // Enable MFA for the user
    await cognitoClient.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: {
        Enabled: true,
        PreferredMfa: true,
      },
    }));
    
    return createSuccessResponse({
      message: 'MFA enabled successfully',
    }, correlationId);
  } catch (error) {
    console.error('MFA verify error:', error);
    return createErrorResponse(400, 'Failed to verify MFA code', correlationId);
  }
}

/**
 * Handle MFA disable
 */
async function handleMFADisable(event: APIGatewayProxyEvent, context: Context, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const auth = await AuthMiddleware.authenticate(event, context);
    const accessToken = event.headers.Authorization?.replace('Bearer ', '');
    
    if (!accessToken) {
      return createErrorResponse(400, 'Access token is required', correlationId);
    }
    
    // Disable MFA
    await cognitoClient.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: {
        Enabled: false,
        PreferredMfa: false,
      },
    }));
    
    // Log security event
    await AuthMiddleware.logSecurityEvent(
      auth.user.userId,
      'MFA_DISABLED',
      { correlationId },
      correlationId
    );
    
    return createSuccessResponse({
      message: 'MFA disabled successfully',
    }, correlationId);
  } catch (error) {
    console.error('MFA disable error:', error);
    return createErrorResponse(400, 'Failed to disable MFA', correlationId);
  }
}

/**
 * Handle session info request
 */
async function handleSessionInfo(event: APIGatewayProxyEvent, context: Context, correlationId: string): Promise<APIGatewayProxyResult> {
  try {
    const auth = await AuthMiddleware.authenticate(event, context);
    
    return createSuccessResponse({
      user: {
        userId: auth.user.userId,
        email: auth.user.email,
        role: auth.user.role,
        permissions: auth.user.permissions,
        profile: {
          givenName: auth.user.profile.givenName,
          familyName: auth.user.profile.familyName,
          preferences: auth.user.profile.preferences,
          lastLoginAt: auth.user.profile.lastLoginAt,
          mfaEnabled: auth.user.profile.mfaEnabled,
        },
      },
      session: {
        correlationId: auth.correlationId,
        requestTime: auth.requestTime,
      },
    }, correlationId);
  } catch (error) {
    console.error('Session info error:', error);
    return createErrorResponse(401, 'Invalid session', correlationId);
  }
}

/**
 * Update login statistics
 */
async function updateLoginStatistics(email: string, success: boolean, correlationId: string): Promise<void> {
  try {
    // Get user by email
    const userResult = await dynamoClient.send(new GetItemCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'EmailIndex',
      Key: marshall({ email }),
    }));
    
    if (!userResult.Item) {
      return;
    }
    
    const user = unmarshall(userResult.Item);
    const now = new Date().toISOString();
    
    if (success) {
      // Reset failed login attempts on successful login
      await dynamoClient.send(new UpdateItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: marshall({ userId: user.userId }),
        UpdateExpression: 'SET lastLoginAt = :now, #security.#failedLoginAttempts = :zero REMOVE #security.#accountLockedUntil',
        ExpressionAttributeNames: {
          '#security': 'security',
          '#failedLoginAttempts': 'failedLoginAttempts',
          '#accountLockedUntil': 'accountLockedUntil',
        },
        ExpressionAttributeValues: marshall({
          ':now': now,
          ':zero': 0,
        }),
      }));
    } else {
      // Increment failed login attempts
      const failedAttempts = (user.security?.failedLoginAttempts || 0) + 1;
      const lockAccount = failedAttempts >= 5;
      const lockUntil = lockAccount ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : undefined; // 30 minutes
      
      const updateExpression = lockAccount
        ? 'SET #security.#failedLoginAttempts = :attempts, #security.#lastFailedLoginAt = :now, #security.#accountLockedUntil = :lockUntil'
        : 'SET #security.#failedLoginAttempts = :attempts, #security.#lastFailedLoginAt = :now';
      
      const expressionAttributeValues: any = {
        ':attempts': failedAttempts,
        ':now': now,
      };
      
      if (lockUntil) {
        expressionAttributeValues[':lockUntil'] = lockUntil;
      }
      
      await dynamoClient.send(new UpdateItemCommand({
        TableName: USER_PROFILES_TABLE,
        Key: marshall({ userId: user.userId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#security': 'security',
          '#failedLoginAttempts': 'failedLoginAttempts',
          '#lastFailedLoginAt': 'lastFailedLoginAt',
          ...(lockAccount && { '#accountLockedUntil': 'accountLockedUntil' }),
        },
        ExpressionAttributeValues: marshall(expressionAttributeValues),
      }));
      
      if (lockAccount) {
        await AuthMiddleware.logSecurityEvent(
          user.userId,
          'ACCOUNT_LOCKED',
          { failedAttempts, lockUntil, correlationId },
          correlationId
        );
      }
    }
  } catch (error) {
    console.error('Error updating login statistics:', error);
  }
}

/**
 * Create success response
 */
function createSuccessResponse(data: any, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: true,
      data,
      correlationId,
    }),
  };
}

/**
 * Create error response
 */
function createErrorResponse(statusCode: number, message: string, correlationId: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'X-Correlation-ID': correlationId,
    },
    body: JSON.stringify({
      success: false,
      error: {
        message,
        code: statusCode,
      },
      correlationId,
    }),
  };
}