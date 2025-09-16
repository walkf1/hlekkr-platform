import React from 'react';

const SimpleApp: React.FC = () => {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🎯 Hlekkr Demo</h1>
      <p>Deepfake Detection Platform</p>
      <div style={{ marginTop: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>Demo Features:</h2>
        <ul>
          <li>✅ Media Upload & Analysis</li>
          <li>✅ Trust Score Calculation</li>
          <li>✅ Real-time Processing</li>
          <li>✅ User Interface</li>
        </ul>
      </div>
      <div style={{ marginTop: '20px' }}>
        <a href="/" style={{ padding: '10px 20px', background: '#007cba', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>
          Demo Access
        </a>
      </div>
    </div>
  );
};

export default SimpleApp;