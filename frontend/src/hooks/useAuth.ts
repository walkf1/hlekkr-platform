import { useState, useEffect, useCallback, useContext, createContext, ReactNode } from 'react';
import { authService, User, LoginCredentials, SignUpData, AuthTokens } from '../services/authService';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (credentials: LoginCredentials) => Promise<void>;
  signUp: (data: SignUpData) => Promise<{ userSub: string; codeDeliveryDetails: any }>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<any>;
  confirmPassword: (email: string, code: string, newPassword: string) => Promise<void>;
  setupMFA: () => Promise<{ secretCode: string; qrCodeUrl: string }>;
  verifyMFA: (code: string) => Promise<void>;
  disableMFA: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  clearError: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string | string[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize authentication state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        const currentUser = authService.getCurrentUser();
        
        if (currentUser) {
          // Verify tokens are still valid
          try {
            await authService.refreshTokens();
            setUser(currentUser);
          } catch (error) {
            console.error('Token refresh failed during initialization:', error);
            await authService.signOut();
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        setError('Failed to initialize authentication');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.signIn(credentials);
      
      if (result.challengeName) {
        // Handle MFA or other challenges
        setError(`Authentication challenge required: ${result.challengeName}`);
        return;
      }
      
      setUser(result.user);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign in failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (data: SignUpData) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.signUp(data);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign up failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const confirmSignUp = useCallback(async (email: string, code: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.confirmSignUp(email, code);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Confirmation failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.signOut();
      setUser(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sign out failed';
      setError(errorMessage);
      console.error('Sign out error:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const changePassword = useCallback(async (oldPassword: string, newPassword: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.changePassword(oldPassword, newPassword);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password change failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.forgotPassword(email);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Forgot password failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const confirmPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.confirmPassword(email, code, newPassword);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password confirmation failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setupMFA = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await authService.setupMFA();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'MFA setup failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const verifyMFA = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.verifyMFA(code);
      
      // Update user MFA status
      if (user) {
        setUser({ ...user, mfaEnabled: true });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'MFA verification failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const disableMFA = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await authService.disableMFA();
      
      // Update user MFA status
      if (user) {
        setUser({ ...user, mfaEnabled: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'MFA disable failed';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const refreshTokens = useCallback(async () => {
    try {
      await authService.refreshTokens();
    } catch (error) {
      console.error('Token refresh failed:', error);
      await signOut();
      throw error;
    }
  }, [signOut]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user || !user.permissions) {
      return false;
    }
    return user.permissions[permission] === true;
  }, [user]);

  const hasRole = useCallback((role: string | string[]): boolean => {
    if (!user) {
      return false;
    }
    
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    
    return user.role === role;
  }, [user]);

  const contextValue: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    error,
    signIn,
    signUp,
    confirmSignUp,
    signOut,
    changePassword,
    forgotPassword,
    confirmPassword,
    setupMFA,
    verifyMFA,
    disableMFA,
    refreshTokens,
    clearError,
    hasPermission,
    hasRole,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Additional hooks for specific use cases

/**
 * Hook for protected routes
 */
export const useRequireAuth = (requiredPermissions?: string[], requiredRoles?: string[]) => {
  const { user, isAuthenticated, isLoading, hasPermission, hasRole } = useAuth();

  const hasRequiredPermissions = requiredPermissions 
    ? requiredPermissions.every(permission => hasPermission(permission))
    : true;

  const hasRequiredRoles = requiredRoles
    ? requiredRoles.some(role => hasRole(role))
    : true;

  const canAccess = isAuthenticated && hasRequiredPermissions && hasRequiredRoles;

  return {
    user,
    isAuthenticated,
    isLoading,
    canAccess,
    hasRequiredPermissions,
    hasRequiredRoles,
  };
};

/**
 * Hook for user profile management
 */
export const useUserProfile = () => {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateProfile = useCallback(async (updates: Partial<User>) => {
    try {
      setIsUpdating(true);
      setUpdateError(null);
      
      // Convert user updates to Cognito attributes
      const attributes: Record<string, string> = {};
      
      if (updates.givenName) attributes.given_name = updates.givenName;
      if (updates.familyName) attributes.family_name = updates.familyName;
      if (updates.email) attributes.email = updates.email;
      
      await authService.updateUserAttributes(attributes);
      
      // Note: In a real implementation, you'd also update the user profile in your backend
      // and refresh the user state
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      setUpdateError(errorMessage);
      throw error;
    } finally {
      setIsUpdating(false);
    }
  }, []);

  return {
    user,
    isUpdating,
    updateError,
    updateProfile,
    clearUpdateError: () => setUpdateError(null),
  };
};

/**
 * Hook for session management
 */
export const useSession = () => {
  const { user, isAuthenticated, refreshTokens } = useAuth();
  const [sessionInfo, setSessionInfo] = useState<{
    expiresAt: Date | null;
    timeUntilExpiry: number | null;
  }>({
    expiresAt: null,
    timeUntilExpiry: null,
  });

  useEffect(() => {
    const updateSessionInfo = () => {
      const tokens = authService.getTokens();
      if (tokens) {
        const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
        const timeUntilExpiry = tokens.expiresIn;
        
        setSessionInfo({
          expiresAt,
          timeUntilExpiry,
        });
      } else {
        setSessionInfo({
          expiresAt: null,
          timeUntilExpiry: null,
        });
      }
    };

    updateSessionInfo();
    
    // Update session info every minute
    const interval = setInterval(updateSessionInfo, 60000);
    
    return () => clearInterval(interval);
  }, [user, isAuthenticated]);

  return {
    ...sessionInfo,
    refreshTokens,
    isSessionValid: isAuthenticated && sessionInfo.timeUntilExpiry !== null && sessionInfo.timeUntilExpiry > 0,
  };
};