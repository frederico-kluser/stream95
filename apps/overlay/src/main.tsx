import '@react95/core/GlobalStyle';
import './styles.css';
import type { ClientRole } from '@stream95/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getClient } from './lib/stream';

// Decide the WebSocket role before anything renders: the dock gets moderation
// data, the audio page gets only sound events, overlays get the rest.
const path = location.pathname;
const role: ClientRole = path.startsWith('/dock') ? 'dock' : path.startsWith('/overlay/audio') ? 'audio' : 'overlay';
getClient(role);
document.body.classList.add(`s95-role-${role}`);
if (path === '/' || path.startsWith('/dock')) document.body.classList.add('s95-opaque');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
