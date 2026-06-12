import {
  IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonText, IonTitle, IonToolbar,
} from '@ionic/react';

export function PlaceholderPage({ title }: { title: string }) {
  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start"><IonMenuButton /></IonButtons>
          <IonTitle>{title}</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <h1 style={{ fontFamily: 'var(--font-display)' }}>{title}</h1>
        <IonText color="medium"><p>Sezione in arrivo (Fase 1).</p></IonText>
      </IonContent>
    </IonPage>
  );
}
