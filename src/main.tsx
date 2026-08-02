import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { getServiceWorkerUrl } from './lib/runtime-path';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(getServiceWorkerUrl(import.meta.env.BASE_URL, window.location.origin)));
}
