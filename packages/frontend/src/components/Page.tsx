import type { ReactNode } from 'react';
import {
  IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonBackButton, IonSpinner, IonText,
} from '@ionic/react';

export function Page({ title, action, children, back }: { title: string; action?: ReactNode; children: ReactNode; back?: string }) {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            {back ? <IonBackButton defaultHref={back} /> : <IonMenuButton />}
          </IonButtons>
          <IonTitle>{title}</IonTitle>
          {action && <IonButtons slot="end">{action}</IonButtons>}
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">{children}</IonContent>
    </IonPage>
  );
}

export function Loading() {
  return <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}><IonSpinner name="crescent" /></div>;
}

export function ErrorBox({ message }: { message: string }) {
  return <IonText color="danger"><p>{message}</p></IonText>;
}

export function Empty({ text }: { text: string }) {
  return <IonText color="medium"><p>{text}</p></IonText>;
}
