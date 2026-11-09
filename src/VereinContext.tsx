import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from 'react'
import { supabase } from './supabaseClient'
import { Verein } from './types'

// Die Standardfarbe aus styles.css (Boppard). Entspricht sie der Vereinsfarbe,
// bleiben die dort definierten Varianten (dunkel/hell) unverändert, damit Boppard
// exakt so aussieht wie vorher.
const STANDARD_PRIMARY = '#0d631b'
const BASISDOMAIN = 'schichtmeisterapp.de'
const ALIAS_FUER_BOPPARD = ['app', 'www']
const STANDARD_SLUG = 'boppard'
const CACHE_PREFIX = 'schichtmeister:verein:'

// ── Slug aus Host ──────────────────────────────────────────────────────────
// boppard.schichtmeisterapp.de -> boppard | app./www./(ohne Subdomain) -> boppard
// localhost, *.vercel.app und alle anderen Hosts -> ?verein=<slug>, sonst boppard
export function slugErmitteln(hostname: string, search: string): { slug: string; ausParameter: boolean } {
  const host = hostname.toLowerCase()
  const suffix = '.' + BASISDOMAIN

  if (host === BASISDOMAIN) return { slug: STANDARD_SLUG, ausParameter: false }

  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length).split('.')[0]
    if (ALIAS_FUER_BOPPARD.includes(label)) return { slug: STANDARD_SLUG, ausParameter: false }
    return { slug: label, ausParameter: false }
  }

  const param = new URLSearchParams(search).get('verein')?.toLowerCase() ?? ''
  if (/^[a-z0-9-]{1,30}$/.test(param)) return { slug: param, ausParameter: true }
  return { slug: STANDARD_SLUG, ausParameter: false }
}

// ── Farben ─────────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-f]{6}$/i

function mischen(hex: string, ziel: [number, number, number], anteil: number): string {
  const kanal = (i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  return '#' + [0, 1, 2]
    .map(i => Math.round(kanal(i) * (1 - anteil) + ziel[i] * anteil).toString(16).padStart(2, '0'))
    .join('')
}

// ── Cache (nur Komfort: kein Aufblitzen beim Start; localStorage kann fehlen) ──
function cacheLesen(slug: string): Verein | null {
  try {
    const roh = localStorage.getItem(CACHE_PREFIX + slug)
    return roh ? (JSON.parse(roh) as Verein) : null
  } catch { return null }
}
function cacheSchreiben(slug: string, v: Verein | null) {
  try {
    if (v) localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify(v))
    else localStorage.removeItem(CACHE_PREFIX + slug)
  } catch { /* ignorieren */ }
}

// ── Branding im Dokument ───────────────────────────────────────────────────
function metaSetzen(name: string, content: string) {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.name = name; document.head.appendChild(el) }
  el.content = content
}
function linkSetzen(rel: string, href: string) {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) { el = document.createElement('link'); el.rel = rel; document.head.appendChild(el) }
  el.href = href
}

function brandingAnwenden(v: Verein, ausParameter: boolean) {
  const root = document.documentElement
  const primary = HEX.test(v.farbe_primary) ? v.farbe_primary : STANDARD_PRIMARY

  if (primary.toLowerCase() !== STANDARD_PRIMARY) {
    root.style.setProperty('--primary', primary)
    root.style.setProperty('--primary-dark', mischen(primary, [0, 0, 0], 0.28))
    root.style.setProperty('--primary-light', mischen(primary, [255, 255, 255], 0.9))
  } else {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-dark')
    root.style.removeProperty('--primary-light')
  }
  // --secondary ist in styles.css ein Grauton für Text. Nur überschreiben, wenn der Verein eine Farbe hat.
  if (v.farbe_secondary && HEX.test(v.farbe_secondary)) root.style.setProperty('--secondary', v.farbe_secondary)
  else root.style.removeProperty('--secondary')

  document.title = `Schichtmeister – ${v.name}`
  metaSetzen('theme-color', primary)
  metaSetzen('apple-mobile-web-app-title', v.name)
  metaSetzen('description', `Helferplanung für ${v.name}`)

  const icon192 = v.icon_192_url || '/icon-192.png'
  linkSetzen('icon', icon192)
  linkSetzen('apple-touch-icon', icon192)

  // Bei ?verein= (Vorschau/localhost) muss das Manifest den Slug kennen, es gibt keinen Host-Hinweis.
  linkSetzen('manifest', ausParameter ? `/manifest.json?verein=${encodeURIComponent(v.slug)}` : '/manifest.json')
}

// ── Kontext ────────────────────────────────────────────────────────────────
const VereinContext = createContext<Verein | null>(null)

/** Aktueller Verein. Nur innerhalb des VereinProvider nutzbar (der rendert Kinder erst, wenn der Verein feststeht). */
export function useVerein(): Verein {
  const v = useContext(VereinContext)
  if (!v) throw new Error('useVerein muss innerhalb von VereinProvider verwendet werden')
  return v
}

type Status = 'laedt' | 'ok' | 'unbekannt' | 'fehler'

const seite: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  minHeight: '100vh', gap: 12, padding: 24, textAlign: 'center',
  fontFamily: 'Manrope, sans-serif', color: '#5d5e61',
}

export function VereinProvider({ children }: { children: ReactNode }) {
  const { slug, ausParameter } = useMemo(
    () => slugErmitteln(window.location.hostname, window.location.search), [],
  )
  const [verein, setVerein] = useState<Verein | null>(() => cacheLesen(slug))
  const [status, setStatus] = useState<Status>(() => (cacheLesen(slug) ? 'ok' : 'laedt'))

  const laden = useCallback(async () => {
    const { data, error } = await supabase
      .from('vereine_public').select('*').eq('slug', slug).maybeSingle()

    if (error) {
      // Netzwerkproblem o. ä.: mit dem Cache weiterarbeiten, sonst Fehlerseite mit "Erneut versuchen"
      setStatus(s => (s === 'ok' ? 'ok' : 'fehler'))
      return
    }
    if (!data) { cacheSchreiben(slug, null); setVerein(null); setStatus('unbekannt'); return }

    const v: Verein = { ...data, features: data.features ?? {} }
    cacheSchreiben(slug, v)
    setVerein(v)
    setStatus('ok')
  }, [slug])

  useEffect(() => { laden() }, [laden])
  useEffect(() => { if (verein) brandingAnwenden(verein, ausParameter) }, [verein, ausParameter])

  if (status === 'ok' && verein) {
    return <VereinContext.Provider value={verein}>{children}</VereinContext.Provider>
  }

  if (status === 'unbekannt') return (
    <div style={seite}>
      <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#9ca3af' }}>search_off</span>
      <p style={{ fontFamily: 'Lexend, sans-serif', fontWeight: 700, fontSize: 18, color: '#191c1b' }}>
        Diesen Verein gibt es nicht
      </p>
      <p style={{ fontSize: 14 }}>Bitte prüfe die Adresse oder frage deinen Verein nach dem richtigen Link.</p>
    </div>
  )

  if (status === 'fehler') return (
    <div style={seite}>
      <p style={{ fontFamily: 'Lexend, sans-serif', fontWeight: 700, fontSize: 18, color: '#191c1b' }}>
        Verbindung fehlgeschlagen
      </p>
      <p style={{ fontSize: 14 }}>Die App konnte nicht geladen werden. Prüfe deine Internetverbindung.</p>
      <button
        onClick={() => { setStatus('laedt'); laden() }}
        style={{ marginTop: 8, padding: '12px 20px', border: 'none', borderRadius: 12, background: STANDARD_PRIMARY, color: '#fff', fontFamily: 'Lexend, sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
      >
        Erneut versuchen
      </button>
    </div>
  )

  return (
    <div style={seite}>
      <p style={{ fontSize: 14 }}>Schichtmeister wird geladen...</p>
    </div>
  )
}
