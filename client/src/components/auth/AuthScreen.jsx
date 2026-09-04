import { useState } from 'react';
import LoginForm from './LoginForm.jsx';
import RegisterForm from './RegisterForm.jsx';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  return (
    <div className="auth-screen">
      <div className="auth-screen-header">
        <span className="app-title-icon">⌨</span>
        <h1>SSH Web Terminal</h1>
      </div>
      <div className="auth-card">
        {mode === 'login' ? (
          <LoginForm onSwitchToRegister={() => setMode('register')} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setMode('login')} />
        )}
      </div>
    </div>
  );
}
