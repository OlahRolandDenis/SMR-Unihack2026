import axios from 'axios'
import { API_URL, sessionId } from './config'

const api = axios.create({ baseURL: API_URL })

const auth = (token) => ({ headers: { Authorization: `Bearer ${token}` } })

// --- public ---
export const getLanterns = () => api.get('/api/lanterns').then((r) => r.data)
export const getLantern = (id) => api.get(`/api/lanterns/${id}`).then((r) => r.data)
export const getLanternStories = (id) =>
  api.get(`/api/lanterns/${id}/stories`).then((r) => r.data)
export const getAnalytics = (id) =>
  api.get(`/api/lanterns/${id}/analytics`).then((r) => r.data)

export const sendPing = (lanternId, userId = null) =>
  api
    .post('/api/presence/ping', {
      lantern_id: lanternId,
      session_id: sessionId(),
      user_id: userId,
    })
    .then((r) => r.data)

export const triggerLanternPlay = (lanternId, storyId, lang) =>
  api
    .post(`/api/lanterns/${lanternId}/play`, { story_id: storyId, lang })
    .then((r) => r.data)

// --- authenticated ---
export const submitStory = (token, lanternId, audioBlob, filename) => {
  const form = new FormData()
  form.append('audio', audioBlob, filename)
  form.append('lantern_id', lanternId)
  form.append('consent', 'true')
  return api.post('/api/stories', form, auth(token)).then((r) => r.data)
}

export const getMyStories = (token) =>
  api.get('/api/stories/mine', auth(token)).then((r) => r.data)

export const deleteStory = (token, storyId) =>
  api.delete(`/api/stories/${storyId}`, auth(token)).then((r) => r.data)

// --- moderator ---
export const getPendingStories = (token) =>
  api.get('/api/moderation/pending', auth(token)).then((r) => r.data)

export const approveStory = (token, storyId) =>
  api.post(`/api/moderation/${storyId}/approve`, null, auth(token)).then((r) => r.data)

export const rejectStory = (token, storyId, reason) =>
  api
    .post(`/api/moderation/${storyId}/reject`, { reason }, auth(token))
    .then((r) => r.data)
