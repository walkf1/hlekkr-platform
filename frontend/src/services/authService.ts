import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession, CognitoUserAttribute } from 'amazon-cognito-identity-js';

// Configuration from environment variables
const poolData = {
  UserPoolId: process.env.REACT_APP_USER_POOL_ID!,
  ClientId: process.env.REACT_APP_USER_POOL_CLIENT_ID!,
};

const userPool = new CognitoUserPool(poolData);

export interface User {
  userId: string;
  email: string;
  givenName: string;
  familyName: string;
  role: 'user' | 'moderator' | 'admin' | 'super_admin';
  permissions: Record<string, boolean>;
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    notifications: Record<string, boolean>;
  };
  mfaEnabled: boolean;
  lastLoginAt?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface SignUpData {
  email: string;
  password: string;
  givenName: string;
  familyName: string;
  organization?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
}

export interface MFASetupResponse {
  secretCode: string;
  qrCodeUrl: string;
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private tokens: AuthTokens | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.initializeFromStorage();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Initialize authentication state from local storage
   */
  private initializeFromStorage(): void {
    try {
      const storedTokens = localStorage.getItem('hlekkr_auth_tokens');
      const storedUser = localStorage.getItem('hlekkr_user');

      if (storedTokens && storedUser) {
        this.tokens = JSON.parse(storedTokens);
        this.currentUser = JSON.parse(storedUser);
        this.scheduleTokenRefresh();
      }
    } catch (error) {
      console.error('Error initializing auth from storage:', error);
      this.clearStorage();
    }
  }

  /**
   * Sign in user with email and password
   */
  public async signIn(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens; challengeName?: string; session?: string }> {
    return new Promise((resolve, reject) => {
      const { email, password } = credentials;
      
      const authenticationDetails = new AuthenticationDetails({
        Username: email,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: async (session: CognitoUserSession) => {
          try {
            const tokens = this.extractTokensFromSession(session);
            const user = await this.getUserFromSession(session);
            
            this.setAuthState(user, tokens);
            
            resolve({ user, tokens });
          } catch (error) {
            reject(error);
          }
        },
        onFailure: (error) => {
          console.error('Authentication failed:', error);
          reject(new Error(error.message || 'Authentication failed'));
        },
        mfaRequired: (challengeName, challengeParameters) => {
          resolve({
            user: null as any,
            tokens: null as any,
            challengeName,
            session: challengeParameters.SESSION,
          });
        },
        totpRequired: (challengeName, challengeParameters) => {
          resolve({
            user: null as any,
            tokens: null as any,
            challengeName: 'SOFTWARE_TOKEN_MFA',
            session: challengeParameters.SESSION,
          });
        },
        newPasswordRequired: (userAttributes, requiredAttributes) => {
          resolve({
            user: null as any,
            tokens: null as any,
            challengeName: 'NEW_PASSWORD_REQUIRED',
            session: cognitoUser.getSession((err, session) => session?.getIdToken().getJwtToken()),
          });
        },
      });
    });
  }

  /**
   * Sign up new user
   */
  public async signUp(signUpData: SignUpData): Promise<{ userSub: string; codeDeliveryDetails: any }> {
    return new Promise((resolve, reject) => {
      const { email, password, givenName, familyName, organization } = signUpData;
      
      const attributeList = [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
        new CognitoUserAttribute({ Name: 'given_name', Value: givenName }),
        new CognitoUserAttribute({ Name: 'family_name', Value: familyName }),
        new CognitoUserAttribute({ Name: 'custom:role', Value: 'user' }),
      ];

      if (organization) {
        attributeList.push(new CognitoUserAttribute({ Name: 'custom:organization', Value: organization }));
      }

      userPool.signUp(email, password, attributeList, [], (error, result) => {
        if (error) {
          console.error('Sign up failed:', error);
          reject(new Error(error.message || 'Sign up failed'));
          return;
        }

        if (result) {
          resolve({
            userSub: result.userSub,
            codeDeliveryDetails: result.codeDeliveryDetails,
          });
        }
      });
    });
  }

  /**
   * Confirm sign up with verification code
   */
  public async confirmSignUp(email: string, confirmationCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmRegistration(confirmationCode, true, (error, result) => {
        if (error) {
          console.error('Confirmation failed:', error);
          reject(new Error(error.message || 'Confirmation failed'));
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Sign out current user
   */
  public async signOut(): Promise<void> {
    try {
      const currentUser = userPool.getCurrentUser();
      if (currentUser) {
        currentUser.signOut();
        currentUser.globalSignOut({
          onSuccess: () => {
            console.log('Global sign out successful');
          },
          onFailure: (error) => {
            console.error('Global sign out failed:', error);
          },
        });
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      this.clearAuthState();
    }
  }

  /**
   * Get current authenticated user
   */
  public getCurrentUser(): User | null {
    return this.currentUser;
  }

  /**
   * Get current auth tokens
   */
  public getTokens(): AuthTokens | null {
    return this.tokens;
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.currentUser !== null && this.tokens !== null;
  }

  /**
   * Refresh authentication tokens
   */
  public async refreshTokens(): Promise<AuthTokens> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.getSession((error: any, session: CognitoUserSession) => {
        if (error) {
          console.error('Token refresh failed:', error);
          this.clearAuthState();
          reject(error);
          return;
        }

        if (session && session.isValid()) {
          const tokens = this.extractTokensFromSession(session);
          this.tokens = tokens;
          this.saveTokensToStorage(tokens);
          this.scheduleTokenRefresh();
          resolve(tokens);
        } else {
          this.clearAuthState();
          reject(new Error('Invalid session'));
        }
      });
    });
  }

  /**
   * Change user password
   */
  public async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.getSession((error: any, session: CognitoUserSession) => {
        if (error) {
          reject(error);
          return;
        }

        currentUser.changePassword(oldPassword, newPassword, (error, result) => {
          if (error) {
            console.error('Password change failed:', error);
            reject(new Error(error.message || 'Password change failed'));
            return;
          }

          resolve();
        });
      });
    });
  }

  /**
   * Initiate forgot password flow
   */
  public async forgotPassword(email: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.forgotPassword({
        onSuccess: (data) => {
          resolve(data);
        },
        onFailure: (error) => {
          console.error('Forgot password failed:', error);
          reject(new Error(error.message || 'Forgot password failed'));
        },
      });
    });
  }

  /**
   * Confirm forgot password with new password
   */
  public async confirmPassword(email: string, confirmationCode: string, newPassword: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cognitoUser = new CognitoUser({
        Username: email,
        Pool: userPool,
      });

      cognitoUser.confirmPassword(confirmationCode, newPassword, {
        onSuccess: () => {
          resolve();
        },
        onFailure: (error) => {
          console.error('Password confirmation failed:', error);
          reject(new Error(error.message || 'Password confirmation failed'));
        },
      });
    });
  }

  /**
   * Setup MFA (TOTP)
   */
  public async setupMFA(): Promise<MFASetupResponse> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.getSession((error: any, session: CognitoUserSession) => {
        if (error) {
          reject(error);
          return;
        }

        currentUser.associateSoftwareToken({
          onSuccess: (secretCode) => {
            const qrCodeUrl = this.generateQRCodeUrl(currentUser.getUsername(), secretCode);
            resolve({ secretCode, qrCodeUrl });
          },
          onFailure: (error) => {
            console.error('MFA setup failed:', error);
            reject(new Error(error.message || 'MFA setup failed'));
          },
        });
      });
    });
  }

  /**
   * Verify MFA setup
   */
  public async verifyMFA(totpCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.verifySoftwareToken(totpCode, 'HLEKKR-MFA', {
        onSuccess: () => {
          // Enable MFA
          currentUser.setUserMfaPreference(null, { PreferredMfa: true, Enabled: true }, (error, result) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        },
        onFailure: (error) => {
          console.error('MFA verification failed:', error);
          reject(new Error(error.message || 'MFA verification failed'));
        },
      });
    });
  }

  /**
   * Disable MFA
   */
  public async disableMFA(): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.setUserMfaPreference(null, { PreferredMfa: false, Enabled: false }, (error, result) => {
        if (error) {
          console.error('MFA disable failed:', error);
          reject(new Error(error.message || 'MFA disable failed'));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Get user attributes
   */
  public async getUserAttributes(): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      currentUser.getSession((error: any, session: CognitoUserSession) => {
        if (error) {
          reject(error);
          return;
        }

        currentUser.getUserAttributes((error, attributes) => {
          if (error) {
            reject(error);
            return;
          }

          const attributeMap: Record<string, string> = {};
          attributes?.forEach(attr => {
            attributeMap[attr.getName()] = attr.getValue();
          });

          resolve(attributeMap);
        });
      });
    });
  }

  /**
   * Update user attributes
   */
  public async updateUserAttributes(attributes: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const currentUser = userPool.getCurrentUser();
      
      if (!currentUser) {
        reject(new Error('No current user'));
        return;
      }

      const attributeList = Object.entries(attributes).map(([name, value]) => 
        new CognitoUserAttribute({ Name: name, Value: value })
      );

      currentUser.updateAttributes(attributeList, (error, result) => {
        if (error) {
          console.error('Update attributes failed:', error);
          reject(new Error(error.message || 'Update attributes failed'));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Extract tokens from Cognito session
   */
  private extractTokensFromSession(session: CognitoUserSession): AuthTokens {
    return {
      accessToken: session.getAccessToken().getJwtToken(),
      refreshToken: session.getRefreshToken().getToken(),
      idToken: session.getIdToken().getJwtToken(),
      expiresIn: session.getAccessToken().getExpiration() - Math.floor(Date.now() / 1000),
    };
  }

  /**
   * Extract user information from session
   */
  private async getUserFromSession(session: CognitoUserSession): Promise<User> {
    const idToken = session.getIdToken();
    const payload = idToken.payload;

    return {
      userId: payload.sub,
      email: payload.email,
      givenName: payload.given_name,
      familyName: payload.family_name,
      role: payload['custom:role'] || 'user',
      permissions: {}, // Will be loaded from API
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: {},
      },
      mfaEnabled: false, // Will be loaded from API
      lastLoginAt: undefined,
    };
  }

  /**
   * Set authentication state
   */
  private setAuthState(user: User, tokens: AuthTokens): void {
    this.currentUser = user;
    this.tokens = tokens;
    this.saveToStorage(user, tokens);
    this.scheduleTokenRefresh();
  }

  /**
   * Clear authentication state
   */
  private clearAuthState(): void {
    this.currentUser = null;
    this.tokens = null;
    this.clearStorage();
    this.clearRefreshTimer();
  }

  /**
   * Save auth data to local storage
   */
  private saveToStorage(user: User, tokens: AuthTokens): void {
    try {
      localStorage.setItem('hlekkr_user', JSON.stringify(user));
      localStorage.setItem('hlekkr_auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Error saving to storage:', error);
    }
  }

  /**
   * Save tokens to local storage
   */
  private saveTokensToStorage(tokens: AuthTokens): void {
    try {
      localStorage.setItem('hlekkr_auth_tokens', JSON.stringify(tokens));
    } catch (error) {
      console.error('Error saving tokens to storage:', error);
    }
  }

  /**
   * Clear local storage
   */
  private clearStorage(): void {
    try {
      localStorage.removeItem('hlekkr_user');
      localStorage.removeItem('hlekkr_auth_tokens');
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    this.clearRefreshTimer();
    
    if (this.tokens) {
      // Refresh 5 minutes before expiration
      const refreshTime = (this.tokens.expiresIn - 300) * 1000;
      
      if (refreshTime > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshTokens().catch(error => {
            console.error('Automatic token refresh failed:', error);
            this.clearAuthState();
          });
        }, refreshTime);
      }
    }
  }

  /**
   * Clear refresh timer
   */
  private clearRefreshTimer(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Generate QR code URL for TOTP setup
   */
  private generateQRCodeUrl(username: string, secretCode: string): string {
    const issuer = 'Hlekkr';
    const accountName = `${issuer}:${username}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(accountName)}?secret=${secretCode}&issuer=${encodeURIComponent(issuer)}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();