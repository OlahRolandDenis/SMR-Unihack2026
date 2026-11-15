import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n'
import { AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_AUDIENCE } from './config'

// Auth0Provider needs the router's navigate so that, after login, the user
// lands back on the exact page they came from (e.g. /f/unirii/record).
function Auth0WithRedirect({ children }) {
  const navigate = useNavigate()
  return (
    <Auth0Provider
      domain={AUTH0_DOMAIN}
      clientId={AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: AUTH0_AUDIENCE,
      }}
      onRedirectCallback={(appState) =>
        navigate(appState?.returnTo || window.location.pathname)
      }
    >
      {children}
    </Auth0Provider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Auth0WithRedirect>
        <LanguageProvider>
          <App />
        </LanguageProvider>
      </Auth0WithRedirect>
    </BrowserRouter>
  </StrictMode>,
)
