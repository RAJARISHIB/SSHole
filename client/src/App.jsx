import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import AuthScreen from './components/auth/AuthScreen.jsx';
import Workspace from './components/Workspace.jsx';

function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <span className="app-title-icon">⌨</span>
        <p>Loading…</p>
      </div>
    );
  }

  return user ? <Workspace /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
