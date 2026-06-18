import type { CSSProperties, ReactNode } from 'react';
import {
  IonButtons, IonContent, IonHeader, IonMenuButton, IonPage, IonTitle, IonToolbar, IonBackButton, IonSpinner, IonText,
} from '@ionic/react';

/**
 * `bleed`: per le schede con header sticky (ObjectPage) — azzera il padding-top
 * del contenuto scrollabile così la barra Salva/Annulla resta A FILO del titolo,
 * senza il buco dove altrimenti scorrono i dati (regola tassativa, vedi memory).
 */
export function Page({ title, action, children, back, bleed }: { title?: string; action?: ReactNode; children: ReactNode; back?: string; bleed?: boolean }) {
  const bleedStyle = { '--padding-top': '0px', '--padding-bottom': '16px', '--padding-start': '16px', '--padding-end': '16px' } as CSSProperties;
  // Le LISTE (EntityList) hanno già il proprio titolo nella testata: non passano `title`
  // → niente IonHeader, così non si ripete il titolo su una riga in più (no righe vuote).
  const showHeader = !!title || !!back;
  return (
    <IonPage>
      {showHeader && (
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              {back ? <IonBackButton defaultHref={back} /> : <IonMenuButton />}
            </IonButtons>
            {title && <IonTitle>{title}</IonTitle>}
            {action && <IonButtons slot="end">{action}</IonButtons>}
          </IonToolbar>
        </IonHeader>
      )}
      <IonContent className={bleed ? undefined : 'ion-padding'} style={bleed ? bleedStyle : undefined}>
        <div className="page-container">{children}</div>
      </IonContent>
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
