import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { createAuthenticatedFetch } from './utils/authenticatedFetch'

window.fetch = createAuthenticatedFetch(window.fetch.bind(window), {
  baseUrl: window.location.href,
  onUnauthorized: ({ loginUrl }) => {
    if (loginUrl) window.location.replace(loginUrl)
    else window.location.reload()
  },
  onForbidden: () => window.dispatchEvent(new Event('wannav-access-denied')),
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
