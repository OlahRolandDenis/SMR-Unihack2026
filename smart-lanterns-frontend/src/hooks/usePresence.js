import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { sendPing } from '../api'

/**
 * "I am here" heartbeat: pings the backend every 15s while the page is open.
 * The backend drops the session from the live count after 45s of silence.
 * Returns the live people_count for the lantern (refreshed with each ping).
 */
export function usePresence(lanternId) {
  const { user } = useAuth0()
  const [peopleCount, setPeopleCount] = useState(null)

  useEffect(() => {
    if (!lanternId) return
    let cancelled = false

    const ping = () =>
      sendPing(lanternId, user?.sub ?? null)
        .then((d) => !cancelled && setPeopleCount(d.people_count))
        .catch(() => {}) // a missed ping is fine; the next one catches up

    ping() // immediately, so the count shows without a 15s wait
    const timer = setInterval(ping, 15_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [lanternId, user?.sub])

  return peopleCount
}
