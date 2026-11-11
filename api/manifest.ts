// Vercel Function: liefert das Web-App-Manifest je Verein (Host -> Slug -> Name, Icons, Farbe).
// vercel.json leitet /manifest.json hierher um. Die statische public/manifest.json ist entfernt,
// weil Vercel Dateien vor Rewrites ausliefert.
//
// Greift nur auf die öffentliche View vereine_public zu (Anon-Key, wie im Frontend).

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://kfawjltveddyoqewayzh.supabase.co'
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmYXdqbHR2ZWRkeW9xZXdheXpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNjY0NzMsImV4cCI6MjA4OTg0MjQ3M30._oCJg10y_0dyCalOsSiHQ9PZUwW2dZV-2IcseWrWg9k'

const BASISDOMAIN = 'schichtmeisterapp.de'
const HEX = /^#[0-9a-f]{6}$/i

// Gleiche Regeln wie slugErmitteln() in src/VereinContext.tsx (bewusst dupliziert,
// die Function importiert nichts aus src/).
function slugAusAnfrage(host: string, verein: unknown): string {
  const h = host.toLowerCase().split(':')[0]
  const suffix = '.' + BASISDOMAIN
  if (h === BASISDOMAIN) return 'boppard'
  if (h.endsWith(suffix)) {
    const label = h.slice(0, -suffix.length).split('.')[0]
    return label === 'app' || label === 'www' ? 'boppard' : label
  }
  const param = typeof verein === 'string' ? verein.toLowerCase() : ''
  return /^[a-z0-9-]{1,30}$/.test(param) ? param : 'boppard'
}

function manifest(name: string, farbe: string, icon192: string, icon512: string) {
  return {
    name: `Schichtmeister – ${name}`,
    short_name: name,
    description: `Helferplanung für ${name}`,
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: farbe,
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    categories: ['sports', 'productivity'],
    lang: 'de',
  }
}

export default async function handler(req: any, res: any) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const slug = slugAusAnfrage(host, req.query?.verein)

  let zeile: any = null
  try {
    const url = `${SUPABASE_URL}/rest/v1/vereine_public?slug=eq.${encodeURIComponent(slug)}` +
      '&select=name,farbe_primary,icon_192_url,icon_512_url'
    const r = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } })
    if (r.ok) zeile = (await r.json())[0] ?? null
  } catch { /* Fallback unten */ }

  // Datenbank nicht erreichbar: Boppard behält sein bisheriges Manifest, andere Vereine bekommen 503.
  if (!zeile && slug === 'boppard') zeile = { name: 'SSV Boppard', farbe_primary: '#0d631b' }
  if (!zeile) {
    res.status(slug ? 404 : 503).json({ fehler: 'Verein nicht gefunden' })
    return
  }

  const farbe = HEX.test(zeile.farbe_primary) ? zeile.farbe_primary : '#0d631b'
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  res.status(200).send(JSON.stringify(
    manifest(zeile.name, farbe, zeile.icon_192_url || '/icon-192.png', zeile.icon_512_url || '/icon-512.png'),
  ))
}
