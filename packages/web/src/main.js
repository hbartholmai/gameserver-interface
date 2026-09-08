import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/tabs.css';
import { App } from './App.js';
const wurzel = document.getElementById('root');
if (!wurzel)
    throw new Error('Wurzelelement #root fehlt');
createRoot(wurzel).render(_jsx(StrictMode, { children: _jsx(App, {}) }));
//# sourceMappingURL=main.js.map