import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './components/App'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'

const theme = createTheme();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('Service worker registered:', reg);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
