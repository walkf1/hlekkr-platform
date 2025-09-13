// Hlekkr - A High-Trust Audit Platform for Deepfake Detection
// Copyright (C) 2025 Frthst

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public
// License along with this program.  If not, see <https://www.gnu.org/licenses/>.

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