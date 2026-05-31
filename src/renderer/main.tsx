import './styles/globals.css'
import 'xterm/css/xterm.css'
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './store'
import { PromptHost } from './components/PromptHost'

// Prevent Electron's default behavior of navigating to file:// when an OS
// file is dropped on an unhandled region of the window. Our explicit drop
// targets (FileBrowser panes) still receive the event normally.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <StoreProvider>
      <App />
      <PromptHost />
    </StoreProvider>
  </React.StrictMode>
)
