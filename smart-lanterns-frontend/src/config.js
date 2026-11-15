export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN || ''
export const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID || ''
export const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE || ''

// Anonymous presence session id — one per browser, survives refreshes.
export function sessionId() {
  let id = localStorage.getItem('lantern_session_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('lantern_session_id', id)
  }
  return id
}

// Turn a backend-relative audio path ('/audio/x.mp3') into a playable URL.
export const audioSrc = (path) => (path ? `${API_URL}${path}` : null)
