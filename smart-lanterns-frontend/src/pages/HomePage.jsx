import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  Headphones,
  MapPin,
  Mic2,
  Radio,
  Users,
} from 'lucide-react'
import { getLanterns } from '../api'
import { useLang } from '../i18n'

function LanternIllustration() {
  const { t } = useLang()
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="art-sun" />
      <div className="art-label art-label-top"><span /> {t('home.artLabel')}</div>
      <svg className="city-art" viewBox="0 0 640 440" fill="none">
        <path d="M0 370h640" stroke="currentColor" strokeOpacity=".2" />
        <path d="M40 370v-94h83v94m-68-94v-39h53v39m-42-39v-25h31v25m-24-25v-22h17v22" stroke="currentColor" strokeWidth="2" />
        <path d="M155 370V247h72v123m-55-123v-30h38v30m-31-30v-22h24v22" stroke="currentColor" strokeWidth="2" />
        <path d="M245 370V300h92v70m-70 0v-48h47v48" stroke="currentColor" strokeWidth="2" />
        <path d="M368 370V260h84v110m-68-110v-34h52v34m-42-34v-25h32v25" stroke="currentColor" strokeWidth="2" />
        <path d="M478 370v-80h100v80m-77-80v-33h54v33" stroke="currentColor" strokeWidth="2" />
        <path d="M0 370h640v70H0z" fill="currentColor" fillOpacity=".08" />
        <path d="M305 370V178m-26 0h52m-39 0 13-27 13 27m-20 0v-16m14 16v-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="305" cy="169" r="44" fill="#F6C86A" fillOpacity=".12" />
        <circle cx="305" cy="169" r="27" fill="#F6C86A" fillOpacity=".14" />
        <path d="M300 352c-4-31-16-48-36-63m42 62c5-39 20-67 48-84m-49 90c-2-26 4-46 17-64m-13 64c2-20-4-38-18-53" stroke="currentColor" strokeOpacity=".65" strokeWidth="2" strokeLinecap="round" />
        <circle cx="70" cy="146" r="2" fill="currentColor" />
        <circle cx="536" cy="176" r="2" fill="currentColor" />
        <circle cx="451" cy="112" r="2" fill="currentColor" />
        <circle cx="176" cy="112" r="2" fill="currentColor" />
      </svg>
      <div className="art-caption">
        <span className="caption-icon"><AudioLines size={17} /></span>
        <span><strong>{t('home.captionTitle')}</strong><small>{t('home.captionSub')}</small></span>
        <span className="caption-live"><i /> LIVE</span>
      </div>
      <div className="art-label art-label-bottom">45°45' N&nbsp; 21°13' E</div>
    </div>
  )
}

function LanternCard({ lantern, index }) {
  const { t } = useLang()
  const themes = ['card-blue', 'card-sand', 'card-ink']
  return (
    <Link
      to={`/f/${lantern.id}`}
      className={`place-card ${themes[index % themes.length]}`}
    >
      <div className="place-card-top">
        <span className="place-number">0{index + 1}</span>
        <span className="place-arrow"><ArrowUpRight size={19} /></span>
      </div>
      <div className="place-card-bottom">
        <span className="place-icon"><MapPin size={16} /></span>
        <h3>{lantern.name}</h3>
        <p>{lantern.description || t('home.cardFallback')}</p>
        <span className="place-explore">{t('home.cardExplore')} <ArrowUpRight size={15} /></span>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const { hash } = useLocation()
  const { t } = useLang()
  const [lanterns, setLanterns] = useState([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  useEffect(() => {
    getLanterns()
      .then(setLanterns)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="home-page">
      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-line" /> {t('home.eyebrow')}</p>
          <h1>{t('home.h1a')}<br />{t('home.h1b')} <em>{t('home.h1em')}</em></h1>
          <p className="hero-description">{t('home.heroDesc')}</p>
          <div className="hero-actions">
            <Link to="/#locations" className="button button-primary">
              {t('home.heroCta')} <ArrowUpRight size={17} />
            </Link>
            <span className="hero-note"><Radio size={15} /> {t('home.heroNote')}</span>
          </div>
          <div className="hero-meta">
            <span><span className="meta-dot" /> {t('home.heroMeta')}</span>
            <span>TIMIȘOARA · RO</span>
          </div>
        </div>
        <LanternIllustration />
      </section>

      <div className="home-ribbon">
        <span>{t('home.ribbon1')}</span><i />
        <span>{t('home.ribbon2')}</span><i />
        <span>{t('home.ribbon3')}</span><i />
        <span>{t('home.ribbon4')}</span>
      </div>

      <section className="intro-section" id="about">
        <div className="section-kicker"><span>01</span> {t('home.aboutKicker')}</div>
        <div className="intro-content">
          <h2>{t('home.aboutH2a')}<br />{t('home.aboutH2b')} <em>{t('home.aboutH2em')}</em></h2>
          <div className="intro-detail">
            <p>{t('home.aboutText')}</p>
            <div className="intro-points">
              <span><Headphones size={17} /> {t('home.point1')}</span>
              <span><Mic2 size={17} /> {t('home.point2')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="locations-section" id="locations">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span>02</span> {t('home.mapKicker')}</div>
            <h2>{t('home.mapH2a')} <em>{t('home.mapH2em')}</em></h2>
          </div>
          <p>{t('home.mapSub')}</p>
        </div>

        {error && <p className="notice notice-error" role="alert">{t('home.serverError')}</p>}
        {loading && (
          <div className="notice"><span className="loading-dot" /> {t('home.searching')}</div>
        )}
        {!loading && !error && lanterns.length === 0 && (
          <div className="notice">{t('home.noLanterns')}</div>
        )}
        {lanterns.length > 0 && (
          <div className="places-grid">
            {lanterns.map((lantern, index) => (
              <LanternCard key={lantern.id} lantern={lantern} index={index} />
            ))}
          </div>
        )}
      </section>

      <section className="how-section">
        <div className="section-heading">
          <div>
            <div className="section-kicker"><span>03</span> {t('home.howKicker')}</div>
            <h2>{t('home.howH2a')}<br /><em>{t('home.howH2em')}</em></h2>
          </div>
          <span className="how-side-note">{t('home.howNote')}</span>
        </div>
        <div className="steps-grid">
          <article className="step-card">
            <span className="step-index">{t('home.step1Index')}</span>
            <span className="step-icon"><MapPin size={21} /></span>
            <h3>{t('home.step1Title')}</h3>
            <p>{t('home.step1Text')}</p>
            <ArrowDown className="step-arrow" size={18} />
          </article>
          <article className="step-card">
            <span className="step-index">{t('home.step2Index')}</span>
            <span className="step-icon"><Headphones size={21} /></span>
            <h3>{t('home.step2Title')}</h3>
            <p>{t('home.step2Text')}</p>
            <ArrowDown className="step-arrow" size={18} />
          </article>
          <article className="step-card">
            <span className="step-index">{t('home.step3Index')}</span>
            <span className="step-icon"><Users size={21} /></span>
            <h3>{t('home.step3Title')}</h3>
            <p>{t('home.step3Text')}</p>
            <ArrowDown className="step-arrow" size={18} />
          </article>
        </div>
      </section>

      <section className="home-cta">
        <div className="cta-light" />
        <div>
          <p className="eyebrow">{t('home.ctaEyebrow')}</p>
          <h2>{t('home.ctaH2a')}<br />{t('home.ctaH2b')}</h2>
          <p>{t('home.ctaText')}</p>
        </div>
        <Link to="/#locations" className="button button-light">
          {t('home.ctaButton')} <ArrowUpRight size={17} />
        </Link>
      </section>
    </div>
  )
}
