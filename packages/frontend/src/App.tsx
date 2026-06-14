import { useEffect } from 'react';
import { IonApp, IonSpinner } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Route, Switch } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { syncUserLocale } from './i18n';
import { LookupsProvider } from './context/Lookups';
import { ToastProvider } from './ui/Toast';
import { ThemeProvider } from './theme/ThemeContext';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './shell/AppShell';
import { MobileShell } from './mobile/MobileShell';

function Gate() {
  const { user, loading } = useAuth();
  // allinea la lingua UI ad app_user.locale (solo se l'utente non ha scelto a mano)
  useEffect(() => { syncUserLocale(user?.locale); }, [user?.locale]);
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
          <Switch>
            <Route path="/m"><MobileShell /></Route>
            <Route><AppShell /></Route>
          </Switch>
        </IonReactRouter>
      </ToastProvider>
    </LookupsProvider>
  );
}

export function App() {
  return (
    <IonApp>
      <ThemeProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </IonApp>
  );
}
