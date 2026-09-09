import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/tabs.css';
import { App } from './App.js';

const wurzel = document.getElementById('root');
if (!wurzel) throw new Error('Wurzelelement #root fehlt');

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
