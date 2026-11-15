import { useCallback, useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Check, Loader2, LogIn, ShieldCheck, X } from 'lucide-react'
import { approveStory, getPendingStories, rejectStory } from '../api'
import { audioSrc } from '../config'
import { useLang } from '../i18n'

// Edge-case queue: stories Gemini flagged as borderline. Moderators only.
export default function ModerationPage() {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const { t } = useLang()
  const [pending, setPending] = useState(null)
  const [error, setError] = useState(null)
  const [reasons, setReasons] = useState({})

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently()
      setPending(await getPendingStories(token))
      setError(null)
    } catch (e) {
      setError(e.response?.status === 403 ? 'forbidden' : 'load')
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (isAuthenticated) {
      void Promise.resolve().then(load)
    }
  }, [isAuthenticated, load])

  const decide = async (id, approve) => {
    const token = await getAccessTokenSilently()
    try {
      if (approve) await approveStory(token, id)
      else await rejectStory(token, id, reasons[id] || t('mod.defaultReason'))
      load()
    } catch {
      setError('action')
    }
  }

  if (isLoading) {
    return <div className="page-content loading-page"><span className="loading-dot" /><p>{t('shared.checkingSession')}</p></div>
  }
  if (!isAuthenticated) {
    return (
      <div className="page-content state-page">
        <div className="state-symbol"><ShieldCheck size={23} /></div>
        <p className="eyebrow">{t('mod.loginEyebrow')}</p>
        <h1>{t('mod.loginH1a')}<br /><em>{t('mod.loginH1em')}</em></h1>
        <p className="muted">{t('mod.loginText')}</p>
        <button
          className="button button-primary"
          onClick={() => loginWithRedirect({ appState: { returnTo: '/moderation' } })}
        >
          <LogIn size={17} /> {t('mod.loginCta')}
        </button>
      </div>
    )
  }

  const errorText = error === 'forbidden' ? t('mod.forbidden') : error === 'action' ? t('mod.actionError') : t('mod.loadError')

  return (
    <div className="page-content moderation-page">
      <header className="page-heading">
        <p className="eyebrow"><span className="eyebrow-line" /> {t('mod.eyebrow')}</p>
        <h1>{t('mod.h1a')}<br /><em>{t('mod.h1em')}</em></h1>
        <p>{t('mod.sub')}</p>
      </header>

      {error && <p className="notice notice-error" role="alert">{errorText}</p>}
      {pending === null && !error && (
        <div className="notice"><Loader2 className="spin" size={17} /> {t('mod.loading')}</div>
      )}
      {pending?.length === 0 && (
        <div className="empty-panel">
          <span className="empty-icon"><Check size={23} /></span>
          <p className="eyebrow">{t('mod.emptyEyebrow')}</p>
          <h2>{t('mod.emptyH2a')}<br /><em>{t('mod.emptyH2em')}</em></h2>
          <p>{t('mod.emptyText')}</p>
        </div>
      )}
      <div className="moderation-list">
        {pending?.map((story, index) => (
          <article key={story.id} className="moderation-card">
            <div className="moderation-card-head">
              <span className="story-index">{t('mod.reviewIndex')} · {String(index + 1).padStart(2, '0')}</span>
              <span className="moderation-author">{story.author}</span>
            </div>
            <div className="moderation-meta">
              <span><small>{t('mod.place')}</small>{story.lantern_name}</span>
              <span><small>{t('mod.origLang')}</small>{story.language_original || t('mod.unspecified')}</span>
            </div>
            <div className="moderation-text">
              <div><span className="story-place-label">{t('mod.transcript')}</span><p>{story.transcript_original}</p></div>
              <div><span className="story-place-label">{t('mod.translation')}</span><p>{story.text_en}</p></div>
            </div>
            {story.original_audio_url && (
              <div className="moderation-audio">
                <span className="story-place-label">{t('mod.originalAudio')}</span>
                <audio controls preload="none" src={audioSrc(story.original_audio_url)} />
              </div>
            )}
            <label className="moderation-label" htmlFor={`reject-${story.id}`}>{t('mod.reasonLabel')} <span>{t('mod.reasonOptional')}</span></label>
            <input
              id={`reject-${story.id}`}
              className="text-input"
              placeholder={t('mod.reasonPlaceholder')}
              value={reasons[story.id] || ''}
              onChange={(e) => setReasons({ ...reasons, [story.id]: e.target.value })}
            />
            <div className="moderation-actions">
              <button className="button button-primary" onClick={() => decide(story.id, true)}>
                <Check size={16} /> {t('mod.approve')}
              </button>
              <button className="button button-delete" onClick={() => decide(story.id, false)}>
                <X size={16} /> {t('mod.reject')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
