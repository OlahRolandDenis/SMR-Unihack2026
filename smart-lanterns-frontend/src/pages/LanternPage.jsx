import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, Headphones, MapPin, Mic2, Radio, Users } from 'lucide-react'
import { getLantern } from '../api'
import { usePresence } from '../hooks/usePresence'
import { useLang } from '../i18n'

// The page a QR scan lands on: /f/<lanternId>. No login required.
export default function LanternPage() {
  const { lanternId } = useParams()
  const { lang, t } = useLang()
  const [lantern, setLantern] = useState(null)
  const [error, setError] = useState(false)
  const peopleCount = usePresence(lanternId)

  useEffect(() => {
    const load = () => getLantern(lanternId).then(setLantern).catch(() => setError(true))
    load()
    const timer = setInterval(load, 10_000)
    return () => clearInterval(timer)
  }, [lanternId])

  if (error) {
    return (
      <div className="page-content state-page">
        <div className="state-symbol"><MapPin size={24} /></div>
        <p className="eyebrow">{t('lantern.notFoundEyebrow')}</p>
        <h1>{t('lantern.notFoundH1a')}<br /><em>{t('lantern.notFoundH1em')}</em></h1>
        <p className="muted">{t('lantern.notFoundError')}</p>
        <Link to="/" className="button button-primary">{t('lantern.notFoundCta')} <ArrowUpRight size={17} /></Link>
      </div>
    )
  }
  if (!lantern) {
    return (
      <div className="page-content loading-page">
        <span className="loading-dot" />
        <p>{t('lantern.connecting')}</p>
      </div>
    )
  }

  const playing = lantern.now_playing
  const isPlaying = lantern.state === 'playing'
  const [peopleLine1, peopleLine2] = t('lantern.peopleHere').split('\n')

  return (
    <div className="page-content detail-page lantern-detail">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> {t('lantern.back')}</Link>
      <div className="detail-layout">
        <section className="detail-main">
          <p className="eyebrow"><span className="eyebrow-line" /> {t('lantern.eyebrow')}</p>
          <h1>{lantern.name}</h1>
          <p className="detail-description">{lantern.description || t('lantern.fallbackDesc')}</p>
          <div className="place-location"><MapPin size={16} /> {t('lantern.city')}</div>

          <div className="lantern-visual">
            <div className="lantern-glow" />
            <div className="lantern-orbit orbit-one" />
            <div className="lantern-orbit orbit-two" />
            <div className="lantern-bulb"><Radio size={36} strokeWidth={1.3} /></div>
            <span className="visual-caption">{t('lantern.visualCaption')}</span>
            <span className="visual-coordinates">TM · 45°45' N</span>
            <div className={`visual-status ${lantern.online ? '' : 'visual-status-off'}`}>
              <i /> {lantern.online ? t('lantern.online') : t('lantern.offline')}
            </div>
          </div>
        </section>

        <aside className="detail-aside">
          <div className="live-panel">
            <div className="panel-kicker"><span className="live-indicator" /> {t('lantern.hereNow')}</div>
            <div className="live-count">
              <strong>{peopleCount ?? lantern.people_count}</strong>
              <span>{peopleLine1}<br />{peopleLine2}</span>
              <Users size={20} />
            </div>
            <div className="panel-divider" />
            <div className="lantern-status">
              <span className={`status-mark ${isPlaying ? 'status-mark-active' : ''}`} />
              <span>
                <small>{t('lantern.statusLabel')}</small>
                <strong>
                  {!lantern.online
                    ? t('lantern.statusOffline')
                    : isPlaying
                      ? t('lantern.statusPlaying')
                      : lantern.state === 'crowded' ? t('lantern.statusCrowded') : t('lantern.statusIdle')}
                </strong>
              </span>
              <Radio size={18} />
            </div>
          </div>

          {playing && (
            <article className="playing-panel">
              <div className="panel-kicker"><span className="live-indicator" /> {t('lantern.nowPlaying')}</div>
              <p>„{(lang === 'en' ? playing.text_en : playing.text_ro) || (playing.lang === 'en' ? playing.text_en : playing.text_ro)}”</p>
            </article>
          )}

          <div className="detail-actions">
            <Link to={`/f/${lanternId}/listen`} className="button button-primary">
              <Headphones size={18} /> {t('lantern.listen')} <ArrowUpRight size={16} />
            </Link>
            <Link to={`/f/${lanternId}/record`} className="button button-outline">
              <Mic2 size={18} /> {t('lantern.record')}
            </Link>
          </div>
          <p className="aside-note">{t('lantern.asideNote')}</p>
        </aside>
      </div>
    </div>
  )
}
