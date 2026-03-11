/**
 * main.jsx — React application entry point.
 *
 * Mounts the root <App /> component into the #root div in index.html.
 * StrictMode is enabled to surface potential issues during development.
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
