import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowUpRight, AudioLines, Headphones, Radio, Sparkles } from 'lucide-react'
import { getLanternStories, triggerLanternPlay } from '../api'
import { audioSrc } from '../config'
import { useLang } from '../i18n'
import { getUnlocked, saveUnlocked } from '../unlocks'

// Choose a language, play a story on your phone, or send it to the lantern.
export default function ListenPage() {
  const { lanternId } = useParams()
  const { lang: uiLang, t } = useLang()
  const [stories, setStories] = useState([])
  const [lang, setLang] = useState(uiLang) // story language, defaults to UI language
  const [sent, setSent] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(getUnlocked)
  const [unlocking, setUnlocking] = useState(null) // story id mid-reveal
  const timersRef = useRef([])

  useEffect(() => {
    getLanternStories(lanternId)
      .then(setStories)
      .catch(() => setError('load'))
      .finally(() => setLoading(false))
  }, [lanternId])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const sendToLantern = async (storyId) => {
    try {
      await triggerLanternPlay(lanternId, storyId, lang)
      setSent(storyId)
      timersRef.current.push(setTimeout(() => setSent(null), 4000))
      if (!unlocked.has(storyId)) {
        // The lantern polls every ~4 s; let the reveal land as it lights up.
        timersRef.current.push(setTimeout(() => {
          setUnlocking(storyId)
          setUnlocked((prev) => {
            const next = new Set(prev)
            next.add(storyId)
            saveUnlocked(next)
            return next
          })
          timersRef.current.push(setTimeout(() => setUnlocking(null), 1700))
        }, 1600))
      }
    } catch {
      setError('send')
    }
  }

  return (
    <div className="page-content stories-page">
      <Link to={`/f/${lanternId}`} className="back-link"><ArrowLeft size={16} /> {t('listen.back')}</Link>
      <header className="page-heading">
        <p className="eyebrow"><span className="eyebrow-line" /> {t('listen.eyebrow')}</p>
        <h1>{t('listen.h1a')}<br /><em>{t('listen.h1em')}</em></h1>
        <p>{t('listen.sub')}</p>
      </header>

      <div className="stories-toolbar">
        <div className="story-count">
          <AudioLines size={17} /> {stories.length} {stories.length === 1 ? t('listen.storySingular') : t('listen.storyPlural')}
        </div>
        <div className="language-switch" role="group" aria-label={t('listen.langAria')}>
          <button className={lang === 'ro' ? 'selected' : ''} onClick={() => setLang('ro')}>Română</button>
          <button className={lang === 'en' ? 'selected' : ''} onClick={() => setLang('en')}>English</button>
        </div>
      </div>

      {error && <p className="notice notice-error" role="alert">{error === 'send' ? t('listen.sendError') : t('listen.loadError')}</p>}
      {loading && <div className="notice"><span className="loading-dot" /> {t('listen.loading')}</div>}
      {!loading && stories.length === 0 && !error && (
        <div className="empty-panel">
          <span className="empty-icon"><Headphones size={23} /></span>
          <p className="eyebrow">{t('listen.emptyEyebrow')}</p>
          <h2>{t('listen.emptyH2a')}<br /><em>{t('listen.emptyH2em')}</em></h2>
          <p>{t('listen.emptyText')}</p>
          <Link to={`/f/${lanternId}/record`} className="button button-primary">
            {t('listen.emptyCta')} <ArrowUpRight size={16} />
          </Link>
        </div>
      )}

      <div className="story-list">
        {stories.map((story, index) => {
          const text = lang === 'en' ? story.text_en : story.text_ro
          const audio = audioSrc(lang === 'en' ? story.audio_en_url : story.audio_ro_url)
          const isUnlocked = unlocked.has(story.id)
          const isUnlocking = unlocking === story.id
          return (
            <article
              key={story.id}
              className={`story-card ${!isUnlocked ? 'story-locked' : ''} ${isUnlocking ? 'story-unlocking' : ''}`}
            >
              <div className="story-card-top">
                <span className="story-index">{t('listen.storyIndex')} · {String(index + 1).padStart(2, '0')}</span>
                <span className="story-language">
                  {!isUnlocked && <Sparkles size={11} />} {lang === 'en' ? 'ENGLISH' : 'ROMÂNĂ'}
                </span>
              </div>
              <div className="story-text">
                <blockquote aria-hidden={!isUnlocked}>
                  {text ? `„${text}”` : t('listen.missingText')}
                </blockquote>
                {(!isUnlocked || isUnlocking) && <span className="stardust" aria-hidden="true" />}
              </div>
              <div className="story-controls">
                {isUnlocked ? (
                  audio ? (
                    <audio controls preload="none" src={audio} aria-label={`${t('listen.playAria')} ${index + 1}`} />
                  ) : <span className="audio-unavailable">{t('listen.noAudio')}</span>
                ) : (
                  <span className="locked-hint"><Sparkles size={14} /> {t('listen.lockedHint')}</span>
                )}
                <button className="button button-outline button-small" onClick={() => sendToLantern(story.id)}>
                  <Radio size={16} />
                  {sent === story.id ? t('listen.sentToLantern') : t('listen.sendToLantern')}
                </button>
              </div>
              {sent === story.id && <p className="inline-success">{t('listen.sentNote')}</p>}
            </article>
          )
        })}
      </div>

      {stories.length > 0 && (
        <div className="listen-note"><Headphones size={17} /> {t('listen.footNote')}</div>
      )}
    </div>
  )
}
