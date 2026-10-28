import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { NotifyProvider } from '@/components/notify';
import { TooltipProvider } from '@/components/ui/tooltip';
import { installClipboardFallback } from '@/lib/clipboard';
import motionTheme from '../motion.theme';
import { App } from './App';
import './index.css';

// Phones on the plain-HTTP LAN address have no Clipboard API: copy buttons still copy there.
installClipboardFallback();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionUIThemeProvider theme={motionTheme}>
      <TooltipProvider>
        <NotifyProvider>
          <App />
        </NotifyProvider>
      </TooltipProvider>
    </MotionUIThemeProvider>
  </StrictMode>,
);
