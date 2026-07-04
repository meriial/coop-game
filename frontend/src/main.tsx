import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { VictoriaApp } from './VictoriaApp';
import { SoundProvider } from './contexts/SoundContext';

const root = createRoot(document.getElementById('root')!);

if (window.location.pathname === '/victoria') {
  root.render(
    <StrictMode>
      <VictoriaApp />
    </StrictMode>
  );
} else {
  root.render(
    <StrictMode>
      <SoundProvider>
        <App />
      </SoundProvider>
    </StrictMode>
  );
}
