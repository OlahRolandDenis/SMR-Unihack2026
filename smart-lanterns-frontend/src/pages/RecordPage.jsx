import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Loader2,
  LogIn,
  Mic,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
} from 'lucide-react'
import { submitStory } from '../api'
import { useLang } from '../i18n'

// Press, speak, submit. Auth0 login REQUIRED + public broadcast consent.
export default function RecordPage() {
  const { lanternId } = useParams()
  const { isAuthenticated, isLoading, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const { t } = useLang()

  const [recording, setRecording] = useState(false)
  const [blob, setBlob] = useState(null)
  const [blobUrl, setBlobUrl] = useState(null)
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [seconds, setSeconds] = useState(0)

  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  useEffect(() => () => clearInterval(timerRef.current), [])

  const startRecording = async () => {
    setError(null)
    setResult(null)
    try {
      // Explicitly request the browser's own mic cleanup — usually on by
      // default for voice, but guaranteed is better than usually.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true },
      })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      const rec = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: mimeType })
        setBlob(b)
        setBlobUrl(URL.createObjectURL(b))
        stream.getTracks().forEach((track) => track.stop())
      }
      rec.start()
      recorderRef.current = rec
      setRecording(true)
      setSeconds(0)
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError(t('record.micError'))
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setRecording(false)
    clearInterval(timerRef.current)
  }

  const reset = () => {
    setBlob(null)
    setBlobUrl(null)
    setResult(null)
    setError(null)
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const token = await getAccessTokenSilently()
      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
      const data = await submitStory(token, lanternId, blob, `story.${ext}`)
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || t('record.submitError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="page-content loading-page"><span className="loading-dot" /><p>{t('shared.checkingSession')}</p></div>
  }

  if (!isAuthenticated) {
    return (
      <div className="page-content state-page">
        <div className="state-symbol"><LogIn size={23} /></div>
        <p className="eyebrow">{t('record.loginEyebrow')}</p>
        <h1>{t('record.loginH1a')}<br /><em>{t('record.loginH1em')}</em></h1>
        <p className="muted">{t('record.loginText')}</p>
        <button
          className="button button-primary"
          onClick={() => loginWithRedirect({ appState: { returnTo: `/f/${lanternId}/record` } })}
        >
          <LogIn size={17} /> {t('record.loginCta')}
        </button>
        <Link to={`/f/${lanternId}`} className="back-link"><ArrowLeft size={16} /> {t('record.back')}</Link>
      </div>
    )
  }

  if (result) {
    const rejected = result.status === 'rejected'
    return (
      <div className="page-content state-page result-page">
        <div className={`state-symbol ${rejected ? 'state-symbol-error' : ''}`}>
          {rejected ? <Mic size={23} /> : <Check size={24} />}
        </div>
        <p className="eyebrow">{rejected ? t('record.rejectedEyebrow') : t('record.thanksEyebrow')}</p>
        <h1>
          {rejected
            ? <>{t('record.rejectedH1a')}<br /><em>{t('record.rejectedH1em')}</em></>
            : <>{t('record.acceptedH1a')}<br /><em>{t('record.acceptedH1em')}</em></>}
        </h1>
        {rejected ? (
          <p className="notice notice-error">{result.reject_reason}</p>
        ) : (
          <p className="muted">
            {result.status === 'pending_review' ? t('record.pendingNote') : t('record.approvedNote')}
          </p>
        )}
        {rejected ? (
          <button className="button button-outline" onClick={reset}><RotateCcw size={16} /> {t('record.tryAgain')}</button>
        ) : (
          <Link to="/my-stories" className="button button-primary">
            {t('record.followStory')} <ArrowUpRight size={17} />
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="page-content record-page">
      <Link to={`/f/${lanternId}`} className="back-link"><ArrowLeft size={16} /> {t('record.back')}</Link>
      <div className="record-layout">
        <section className="record-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> {t('record.eyebrow')}</p>
          <h1>{t('record.h1a')}<br /><em>{t('record.h1em')}</em></h1>
          <p className="record-description">{t('record.description')}</p>
          <div className="record-assurance"><ShieldCheck size={18} /> {t('record.assurance')}</div>
          <div className="record-step-note"><span>01</span> {t('record.stepNote')}</div>
        </section>

        <section className="record-console">
          <div className="console-top"><span>{t('record.consoleTop')}</span><span className="console-format">{t('record.consoleFormat')}</span></div>
          {!blob && (
            <>
              <div className={`record-orbit ${recording ? 'record-orbit-active' : ''}`}>
                <div className="record-orbit-inner" />
                <button
                  className={`record-button ${recording ? 'recording' : ''}`}
                  onClick={recording ? stopRecording : startRecording}
                  aria-label={recording ? t('record.stopAria') : t('record.startAria')}
                >
                  {recording ? <Square size={25} fill="currentColor" /> : <Mic size={27} />}
                </button>
              </div>
              <p className={`record-prompt ${recording ? 'record-prompt-live' : ''}`}>
                {recording ? t('record.promptLive') : t('record.promptIdle')}
              </p>
              {recording && <p className="record-timer">{String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</p>}
              {!recording && <p className="console-hint">{t('record.hint')}</p>}
            </>
          )}

          {blob && (
            <div className="record-review">
              <div className="review-icon"><Check size={20} /></div>
              <h2>{t('record.reviewH2a')}<br />{t('record.reviewH2b')} <em>{t('record.reviewH2em')}</em></h2>
              <p>{t('record.reviewText')}</p>
              <audio controls src={blobUrl} aria-label={t('record.reviewAria')} />
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>{t('record.consentA')} <strong>{t('record.consentStrong')}</strong> {t('record.consentB')}</span>
              </label>
              <div className="review-actions">
                <button className="button button-outline" onClick={reset} disabled={submitting}>
                  <RotateCcw size={16} /> {t('record.redo')}
                </button>
                <button className="button button-primary" onClick={submit} disabled={!consent || submitting}>
                  {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                  {submitting ? t('record.analyzing') : t('record.send')}
                </button>
              </div>
            </div>
          )}
          {error && <p className="notice notice-error" role="alert">{error}</p>}
          <div className="console-bottom"><span>SMART LANTERNS</span><span>TM · RO</span></div>
        </section>
      </div>
    </div>
  )
}
