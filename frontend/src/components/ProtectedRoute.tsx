import React from 'react';
import { useRequireAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions,
  requiredRoles,
}) => {
  const { canAccess, isLoading } = useRequireAuth(requiredPermissions, requiredRoles);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!canAccess) {
    return <div>Access denied. Please sign in.</div>;
  }

  return <>{children}</>;
};