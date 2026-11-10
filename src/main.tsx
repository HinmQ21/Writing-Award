import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito/vietnamese-700.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/vietnamese-800.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/nunito-sans/vietnamese-400.css';
import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/nunito-sans/vietnamese-600.css';
import '@fontsource/nunito-sans/latin-600.css';
import App from './App';
import { ThemeProvider } from './theme';
import './styles.css';

createRoot(document.getElementById('root')!).render(<StrictMode><ThemeProvider><App /></ThemeProvider></StrictMode>);
