import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { ProtectedRoute } from './ProtectedRoute';

const JudgeInterface: React.FC = () => {
  const { user, signOut } = useAuth();

  return (
    <ProtectedRoute requiredRoles={['moderator', 'admin']}>
      <div>
        <h1>Judge Interface</h1>
        <p>Welcome, {user?.givenName} {user?.familyName}</p>
        <p>Role: {user?.role}</p>
        <button onClick={signOut}>Sign Out</button>
        {/* Judge functionality here */}
      </div>
    </ProtectedRoute>
  );
};

export default JudgeInterface;