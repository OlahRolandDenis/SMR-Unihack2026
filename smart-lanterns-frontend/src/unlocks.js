// Stories unlock per browser once they've been played on the lantern.

const KEY = 'lantern_unlocked'

export function getUnlocked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY)) || [])
  } catch {
    return new Set()
  }
}

export function saveUnlocked(set) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch { /* private mode: unlocks just don't persist */ }
}
