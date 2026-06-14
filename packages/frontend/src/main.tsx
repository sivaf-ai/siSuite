import React from 'react';
import { createRoot } from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';

/* CSS core di Ionic */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/text-alignment.css';

/* token del design system → Ionic */
import './theme/variables.css';
import './theme/design-system.css';

/* multilingua: inizializza i18next (it-IT/en/es-AR) prima del render */
import './i18n';

import { App } from './App';
import { applyTheme, initialTheme } from './theme/ThemeContext';

setupIonicReact({ mode: 'md' });

// applica il tema PRIMA del render (niente flash chiaro→scuro)
applyTheme(initialTheme());

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
