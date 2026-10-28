import '@react95/core/GlobalStyle';
import './styles.css';
import type { ClientRole } from '@stream95/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, route } from './App';
import { getClient } from './lib/stream';
import { Home } from './pages/Home';

// Decide the WebSocket role before anything renders: the audio page gets only sound events,
// overlays and scenes get the rest. The control deck is a separate app (apps/deck).
const path = location.pathname;
const role: ClientRole = path.startsWith('/overlay/audio') ? 'audio' : 'overlay';
getClient(role);
document.body.classList.add(`s95-role-${role}`);
// The setup page is a regular page; overlays and scenes stay transparent for OBS.
if (route(path) === Home) document.body.classList.add('s95-opaque');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
