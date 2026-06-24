import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { initVitals } from './lib/vitals.ts';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);

initVitals();

// PWA: register the network-first service worker in production builds only.
// (Dev keeps Vite's HMR untouched.) To remove: DevTools → Application → unregister.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/game/sw.js', { scope: '/game/' })
      .catch(() => undefined);
  });
}
