import { IonApp, IonSpinner } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LookupsProvider } from './context/Lookups';
import { ToastProvider } from './ui/Toast';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './shell/AppShell';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <IonSpinner name="crescent" />
      </div>
    );
  }
  if (!user) return <LoginPage />;
  return (
    <LookupsProvider>
      <ToastProvider>
        <IonReactRouter>
          <AppShell />
        </IonReactRouter>
      </ToastProvider>
    </LookupsProvider>
  );
}

export function App() {
  return (
    <IonApp>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </IonApp>
  );
}
