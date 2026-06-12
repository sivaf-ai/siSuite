import { useState } from 'react';
import { IonContent, IonPage, IonInput, IonButton, IonText, IonSpinner, IonItem, IonList } from '@ionic/react';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('owner@sisuite.local');
  const [password, setPassword] = useState('Owner123!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="login-stage">
          <div className="login-card">
            <div className="login-mark">s</div>
            <h1 style={{ textAlign: 'center' }}>siSuite</h1>
            <p className="sub" style={{ textAlign: 'center', color: 'var(--ink-soft)', margin: '6px 0 22px' }}>
              Gestione attività AI-first
            </p>

            <IonList lines="full">
              <IonItem>
                <IonInput label="Email" labelPlacement="stacked" type="email" value={email}
                  onIonInput={(e) => setEmail(e.detail.value ?? '')} />
              </IonItem>
              <IonItem>
                <IonInput label="Password" labelPlacement="stacked" type="password" value={password}
                  onIonInput={(e) => setPassword(e.detail.value ?? '')}
                  onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </IonItem>
            </IonList>

            {error && <IonText color="danger"><p style={{ margin: '12px 4px 0', fontSize: 14 }}>{error}</p></IonText>}

            <IonButton expand="block" style={{ marginTop: 18, height: 48 }} disabled={busy} onClick={submit}>
              {busy ? <IonSpinner name="crescent" /> : 'Entra'}
            </IonButton>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
