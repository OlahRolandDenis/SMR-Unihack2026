import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowUpRight, MapPinOff, ShieldCheck } from 'lucide-react'
import { getLantern } from '../api'
import { useLang } from '../i18n'
import { currentPosition, distanceMeters, moderatorBypass, withinFence } from '../geo'

/* Wraps every /f/<lanternId> route: the page only renders for visitors who
   are physically at the lantern (or moderators with the ?mod=true bypass).
   Lantern coordinates come from the API, not a hardcoded list. */
export default function GeoGate({ children }) {
  const { lanternId } = useParams()
  const { search } = useLocation()
  const { t } = useLang()
  const [status, setStatus] = useState('checking') // checking | granted | blocked
  const [distance, setDistance] = useState(null)
  const isModerator = moderatorBypass(search)

  const check = useCallback(async () => {
    try {
      const lantern = await getLantern(lanternId)
      if (lantern.latitude == null || lantern.longitude == null) {
        setStatus('granted') // nothing to fence against
        return
      }
      const pos = await currentPosition()
      const d = distanceMeters(
        pos.coords.latitude, pos.coords.longitude,
        lantern.latitude, lantern.longitude,
      )
      setDistance(Math.round(d))
      setStatus(withinFence(d, pos.coords.accuracy) ? 'granted' : 'blocked')
    } catch (e) {
      // Unknown lantern: let the page render its own not-found state.
      if (e.response?.status === 404) setStatus('granted')
      else setStatus('blocked') // GPS denied, timed out, or unsupported
    }
  }, [lanternId])

  const retry = () => {
    setStatus('checking')
    setDistance(null)
    check()
  }

  useEffect(() => {
    // check() is async: every setState inside it runs after an await (GPS /
    // API resolve), never synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isModerator) check()
  }, [isModerator, check])

  // Moderator bypass: skip the GPS check entirely.
  if (isModerator) {
    return (
      <>
        {children}
        <div className="mod-badge"><ShieldCheck size={13} /> {t('geo.modBadge')}</div>
      </>
    )
  }

  if (status === 'granted') {
    return children
  }

  if (status === 'checking') {
    return (
      <div className="page-content loading-page">
        <span className="loading-dot" />
        <p>{t('geo.checking')}</p>
      </div>
    )
  }

  return (
    <div className="page-content state-page">
      <div className="state-symbol state-symbol-error"><MapPinOff size={23} /></div>
      <p className="eyebrow">{t('geo.eyebrow')}</p>
      <h1>{t('geo.h1a')}<br /><em>{t('geo.h1em')}</em></h1>
      <p className="muted">{t('geo.hint')}</p>
      {distance !== null && (
        <p className="muted geo-distance">{t('geo.distanceNote').replace('{m}', String(distance))}</p>
      )}
      <div className="geo-actions">
        <button className="button button-primary" onClick={retry}>{t('geo.retry')}</button>
        <Link to="/" className="button button-outline">
          {t('geo.home')} <ArrowUpRight size={16} />
        </Link>
      </div>
    </div>
  )
}
