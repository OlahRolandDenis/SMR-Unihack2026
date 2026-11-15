import { useState } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { ArrowUpRight, Lamp, LogIn, LogOut, Moon, ScrollText, Sun } from 'lucide-react'
import { useLang } from './i18n'
import HomePage from './pages/HomePage'
import LanternPage from './pages/LanternPage'
import ListenPage from './pages/ListenPage'
import RecordPage from './pages/RecordPage'
import MyStoriesPage from './pages/MyStoriesPage'
import ModerationPage from './pages/ModerationPage'
import GeoGate from './components/GeoGate'

function Header() {
  const { isAuthenticated, loginWithRedirect, logout, user } = useAuth0()
  const { lang, setLang, t } = useLang()
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('lantern_theme', next) } catch { /* ok */ }
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link to="/" className="brand" aria-label={t('brand.aria')}>
          <span className="brand-mark"><Lamp size={21} strokeWidth={1.8} /></span>
          <span className="brand-copy">
            <strong>Smart Lanterns</strong>
            <small>{t('brand.tagline')}</small>
          </span>
        </Link>

        <nav className="main-nav" aria-label={t('nav.aria')}>
          <Link to="/#locations">{t('nav.lanterns')}</Link>
          <Link to="/#about">{t('nav.about')}</Link>
          {isAuthenticated && (
            <Link to="/my-stories" className="nav-stories">
              <ScrollText size={16} /> {t('nav.myStories')}
            </Link>
          )}
        </nav>

        <div className="topbar-controls">
          <button
            className="control-button"
            onClick={() => setLang(lang === 'ro' ? 'en' : 'ro')}
            aria-label={t('langToggle.aria')}
            title={t('langToggle.aria')}
          >
            {lang === 'ro' ? 'EN' : 'RO'}
          </button>
          <button
            className="control-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
            title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {isAuthenticated ? (
            <button
              className="account-button"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              title={user?.email}
            >
              <LogOut size={16} />
              <span>{t('auth.logout')}</span>
            </button>
          ) : (
            <button className="account-button" onClick={() => loginWithRedirect()}>
              <LogIn size={16} />
              <span>{t('auth.login')}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  )
}

function AuthError() {
  const { error } = useAuth0()
  const { t } = useLang()
  if (!error) return null
  return (
    <p className="auth-error" role="alert">
      {t('auth.failed')} {error.message}
    </p>
  )
}

function Footer() {
  const { t } = useLang()
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <Link to="/" className="brand footer-brand">
          <span className="brand-mark"><Lamp size={20} strokeWidth={1.8} /></span>
          <span className="brand-copy">
            <strong>Smart Lanterns</strong>
            <small>{t('footer.tagline')}</small>
          </span>
        </Link>
        <p>{t('footer.blurb')}</p>
        <Link to="/#locations" className="footer-link">
          {t('footer.discover')} <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="footer-bottom">
        <span>{t('footer.location')}</span>
        <span>{t('footer.motto')}</span>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <AuthError />
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          {/* QR code target: /f/<lantern slug> — GPS-fenced (?mod=true bypasses) */}
          <Route path="/f/:lanternId" element={<GeoGate><LanternPage /></GeoGate>} />
          <Route path="/f/:lanternId/listen" element={<GeoGate><ListenPage /></GeoGate>} />
          <Route path="/f/:lanternId/record" element={<GeoGate><RecordPage /></GeoGate>} />
          <Route path="/my-stories" element={<MyStoriesPage />} />
          <Route path="/moderation" element={<ModerationPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
