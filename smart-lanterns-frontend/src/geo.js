// Geo-fencing: a lantern page only unlocks within RADIUS_M of the lantern.

export const RADIUS_M = 80

// GPS in a city square is often 10-30 m off; grant the fix's own stated
// accuracy (capped) as slack so honest visitors aren't locked out.
export const MAX_ACCURACY_SLACK_M = 60

const EARTH_RADIUS_M = 6371000
const toRad = (deg) => (deg * Math.PI) / 180

// Haversine distance in meters between two WGS84 points.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a))
}

export function withinFence(distance, accuracy) {
  return distance <= RADIUS_M + Math.min(accuracy || 0, MAX_ACCURACY_SLACK_M)
}

const MOD_KEY = 'lantern_mod'

/* Moderator bypass: ?mod=true turns it on (persisted), ?mod=false turns it
   off. With the flag on, the GPS check is skipped entirely. */
export function moderatorBypass(search) {
  const param = new URLSearchParams(search).get('mod')
  try {
    if (param === 'true') localStorage.setItem(MOD_KEY, '1')
    if (param === 'false') localStorage.removeItem(MOD_KEY)
    return localStorage.getItem(MOD_KEY) === '1'
  } catch {
    return param === 'true'
  }
}

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 30000,
    })
  })
}
