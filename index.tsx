import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
// Three typefaces, bundled with the site so they load fast and work offline:
// Inter for labels and numbers, Playfair Display for the sentence, Cinzel for the logo.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/cinzel/wght.css';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);