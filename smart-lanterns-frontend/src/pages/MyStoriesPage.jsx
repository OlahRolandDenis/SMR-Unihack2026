import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowUpRight, Loader2, LogIn, ScrollText, Trash2 } from 'lucide-react'
import { deleteStory, getMyStories } from '../api'
import { audioSrc } from '../config'
import { useLang } from '../i18n'

const STATUS_KEY = {
  processing: 'mine.statusProcessing',
  approved: 'mine.statusApproved',
  rejected: 'mine.statusRejected',
  pending_review: 'mine.statusPending',
}

export default function MyStoriesPage() {
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const { t } = useLang()
  const [stories, setStories] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently()
      setStories(await getMyStories(token))
    } catch {
      setError('load')
    }
  }, [getAccessTokenSilently])

  useEffect(() => {
    if (!isAuthenticated) return
    const initialLoad = setTimeout(() => { void load() }, 0)
    const timer = setInterval(() => { void load() }, 10_000)
    return () => {
      clearTimeout(initialLoad)
      clearInterval(timer)
    }
  }, [isAuthenticated, load])

  const remove = async (id) => {
    const token = await getAccessTokenSilently()
    await deleteStory(token, id).catch(() => setError('delete'))
    load()
  }

  if (isLoading) {
    return <div className="page-content loading-page"><span className="loading-dot" /><p>{t('shared.checkingSession')}</p></div>
  }
  if (!isAuthenticated) {
    return (
      <div className="page-content state-page">
        <div className="state-symbol"><LogIn size={23} /></div>
        <p className="eyebrow">{t('mine.loginEyebrow')}</p>
        <h1>{t('mine.loginH1a')}<br /><em>{t('mine.loginH1em')}</em></h1>
        <p className="muted">{t('mine.loginText')}</p>
        <button
          className="button button-primary"
          onClick={() => loginWithRedirect({ appState: { returnTo: '/my-stories' } })}
        >
          <LogIn size={17} /> {t('auth.login')}
        </button>
      </div>
    )
  }

  return (
    <div className="page-content my-stories-page">
      <header className="page-heading">
        <p className="eyebrow"><span className="eyebrow-line" /> {t('mine.eyebrow')}</p>
        <h1>{t('mine.h1a')}<br /><em>{t('mine.h1em')}</em></h1>
        <p>{t('mine.sub')}</p>
      </header>

      {error && (
        <p className="notice notice-error" role="alert">
          {error === 'delete' ? t('mine.deleteError') : t('mine.loadError')}
        </p>
      )}
      {stories === null && <div className="notice"><Loader2 className="spin" size={17} /> {t('mine.loading')}</div>}
      {stories?.length === 0 && (
        <div className="empty-panel">
          <span className="empty-icon"><ScrollText size={23} /></span>
          <p className="eyebrow">{t('mine.emptyEyebrow')}</p>
          <h2>{t('mine.emptyH2a')}<br /><em>{t('mine.emptyH2em')}</em></h2>
          <p>{t('mine.emptyText')}</p>
          <Link to="/#locations" className="button button-primary">{t('mine.emptyCta')} <ArrowUpRight size={16} /></Link>
        </div>
      )}
      <div className="my-story-list">
        {stories?.map((story, index) => (
          <article key={story.id} className="my-story-card">
            <div className="my-story-index">{t('mine.storyIndex')} · {String(index + 1).padStart(2, '0')}</div>
            <div className="my-story-content">
              <div className="my-story-head">
                <div>
                  <span className="story-place-label">{t('mine.placeLabel')}</span>
                  <h2>{story.lantern_name}</h2>
                </div>
                <span className={`status-badge status-${story.status}`}>
                  <i /> {STATUS_KEY[story.status] ? t(STATUS_KEY[story.status]) : story.status}
                </span>
              </div>
              {story.text_ro && <blockquote>„{story.text_ro}”</blockquote>}
              {story.status === 'rejected' && story.reject_reason && (
                <p className="notice notice-error">{story.reject_reason}</p>
              )}
              {story.status === 'approved' && story.audio_ro_url && (
                <audio controls preload="none" src={audioSrc(story.audio_ro_url)} aria-label={t('mine.playAria')} />
              )}
              <div className="my-story-actions">
                <button className="button button-delete" onClick={() => remove(story.id)}>
                  <Trash2 size={15} /> {t('mine.delete')}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
