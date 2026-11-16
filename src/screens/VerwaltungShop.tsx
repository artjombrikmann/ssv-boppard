import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useBestaetigung } from '../components/Bestaetigung'

// Admin-Tab "Shop": Anfragen bearbeiten und Prämien pflegen.
// Alles läuft über Datenbankfunktionen (04n, 04b), nicht über direkte Tabellenzugriffe.

// onGeaendert: nach einer Rückbuchung den Punktestand der App neu laden (der Admin kann selbst Antragsteller sein)
interface Props { vereinId: string; toast: (msg: string) => void; onGeaendert?: () => void }

interface Anfrage {
  id: string; user_id: string; mitglied_name: string; mitglied_email: string | null
  preis_name: string; punkte_kosten: number; status: string; erstellt_am: string; notiz: string | null
}
interface Praemie {
  id: string; name: string; beschreibung: string | null; punkte_kosten: number; verfuegbar: boolean
  kategorie: string | null; anzahl_verfuegbar: number | null; icon: string | null; farbe: string | null
}
interface Form {
  id: string | null; name: string; beschreibung: string; punkte: string; verfuegbar: boolean
  kategorie: string; anzahl: string; icon: string; farbe: string
}

const LEER: Form = { id: null, name: '', beschreibung: '', punkte: '50', verfuegbar: true, kategorie: 'gutschein', anzahl: '', icon: 'redeem', farbe: '#0d631b' }
const HEX = /^#[0-9a-f]{6}$/i

const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  offen:      { label: 'Offen',      bg: '#fff7ed', fg: '#c2410c' },
  bearbeitet: { label: 'Erledigt',   bg: '#ecfdf5', fg: '#047857' },
  abgelehnt:  { label: 'Abgelehnt',  bg: '#fef2f2', fg: '#b91c1c' },
}

export default function VerwaltungShop({ vereinId, toast, onGeaendert }: Props) {
  const [anfragen, setAnfragen] = useState<Anfrage[]>([])
  const [praemien, setPraemien] = useState<Praemie[]>([])
  const [form, setForm]         = useState<Form | null>(null)
  const [busy, setBusy]         = useState(false)
  const [alle, setAlle]         = useState(false)
  const [fragen, dialog]       = useBestaetigung()

  useEffect(() => { laden() }, [vereinId])

  async function laden() {
    const [a, p] = await Promise.all([
      supabase.rpc('shop_anfragen_liste', { p_verein: vereinId }),
      supabase.from('preise').select('*').eq('verein_id', vereinId).order('punkte_kosten'),
    ])
    if (a.error) toast('❌ Anfragen: ' + a.error.message)
    setAnfragen((a.data ?? []) as Anfrage[])
    setPraemien((p.data ?? []) as Praemie[])
  }

  async function bearbeiten(a: Anfrage, status: 'bearbeitet' | 'abgelehnt') {
    if (status === 'abgelehnt' &&
        !await fragen(`Anfrage "${a.preis_name}" von ${a.mitglied_name} ablehnen?\n\n${a.punkte_kosten} Punkte werden zurückgebucht. Eine abgelehnte Anfrage lässt sich nicht wieder öffnen.`, { titel: 'Anfrage ablehnen?', ok: 'Ablehnen', gefahr: true })) return
    setBusy(true)
    const { error } = await supabase.rpc('shop_anfrage_bearbeiten', { p_id: a.id, p_status: status })
    setBusy(false)
    if (error) { toast('❌ ' + error.message); return }
    toast(status === 'abgelehnt' ? '↩️ Abgelehnt, Punkte zurückgebucht' : '✅ Als erledigt markiert')
    laden()
    onGeaendert?.()
  }

  function bearbeitenForm(p: Praemie) {
    setForm({
      id: p.id, name: p.name, beschreibung: p.beschreibung ?? '', punkte: String(p.punkte_kosten),
      verfuegbar: p.verfuegbar, kategorie: p.kategorie ?? '',
      anzahl: p.anzahl_verfuegbar === null ? '' : String(p.anzahl_verfuegbar),
      icon: p.icon ?? '', farbe: p.farbe && HEX.test(p.farbe) ? p.farbe : '#0d631b',
    })
  }

  async function speichern() {
    if (!form) return
    const punkte = Number(form.punkte)
    if (!form.name.trim()) { toast('❌ Bitte einen Namen eingeben'); return }
    if (!Number.isInteger(punkte) || punkte < 0) { toast('❌ Punkte müssen eine ganze Zahl ab 0 sein'); return }
    if (form.anzahl !== '' && (!Number.isInteger(Number(form.anzahl)) || Number(form.anzahl) < 0)) { toast('❌ Bestand muss eine ganze Zahl ab 0 sein (oder leer)'); return }
    setBusy(true)
    const { error } = await supabase.rpc('praemie_speichern', {
      p_verein: vereinId, p_id: form.id, p_name: form.name, p_beschreibung: form.beschreibung,
      p_punkte: punkte, p_verfuegbar: form.verfuegbar, p_kategorie: form.kategorie,
      p_anzahl: form.anzahl === '' ? null : Number(form.anzahl),
      p_icon: form.icon.trim() || null, p_farbe: form.farbe,
    })
    setBusy(false)
    if (error) { toast('❌ ' + error.message); return }
    toast('✅ Prämie gespeichert')
    setForm(null)
    laden()
  }

  async function loeschen(p: Praemie) {
    if (!await fragen(`Prämie "${p.name}" löschen?\n\nGibt es schon Anfragen dazu, wird sie nur ausgeblendet.`, { titel: 'Prämie löschen?', ok: 'Löschen', gefahr: true })) return
    const { data, error } = await supabase.rpc('praemie_loeschen', { p_id: p.id })
    if (error) { toast('❌ ' + error.message); return }
    toast(data === 'ausgeblendet' ? 'Prämie ausgeblendet (es gibt schon Anfragen)' : '🗑️ Prämie gelöscht')
    laden()
  }

  const offen = anfragen.filter(a => a.status === 'offen')
  const sichtbar = alle ? anfragen : offen

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Box title={`Anfragen (${offen.length} offen)`}>
        {sichtbar.length === 0
          ? <p style={leer}>{alle ? 'Noch keine Anfragen.' : 'Keine offenen Anfragen.'}</p>
          : sichtbar.map(a => {
              const st = STATUS[a.status] ?? { label: a.status, bg: '#f3f4f6', fg: '#374151' }
              return (
                <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={titel}>{a.preis_name} <span style={{ ...badge, background: st.bg, color: st.fg }}>{st.label}</span></p>
                      <p style={klein}>{a.mitglied_name} · {a.mitglied_email ?? '–'}</p>
                      <p style={klein}>{a.punkte_kosten} Punkte · {new Date(a.erstellt_am).toLocaleDateString('de-DE')}</p>
                    </div>
                    {a.status === 'offen' && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexShrink: 0 }}>
                        <button disabled={busy} onClick={() => bearbeiten(a, 'bearbeitet')} style={{ ...btn, background: 'var(--primary)', color: '#fff' }}>Erledigt</button>
                        <button disabled={busy} onClick={() => bearbeiten(a, 'abgelehnt')} style={{ ...btn, background: '#fef2f2', color: '#ef4444' }}>Ablehnen</button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
        {anfragen.length > offen.length && (
          <button onClick={() => setAlle(!alle)} style={{ ...btn, background: '#f3f4f6', color: '#374151', marginTop: 10 }}>
            {alle ? 'Nur offene zeigen' : `Alle zeigen (${anfragen.length})`}
          </button>
        )}
      </Box>

      <Box title={`Prämien (${praemien.length})`}>
        {praemien.length === 0 && <p style={leer}>Noch keine Prämien angelegt.</p>}
        {praemien.map(p => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f9fafb', opacity: p.verfuegbar ? 1 : 0.5 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: p.farbe && HEX.test(p.farbe) ? p.farbe : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize: 18, color: '#fff' }}>{p.icon || 'redeem'}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={titel}>{p.name}{!p.verfuegbar && <span style={{ ...badge, background: '#f3f4f6', color: '#6b7280' }}>Ausgeblendet</span>}</p>
              <p style={klein}>{p.punkte_kosten} Punkte · {p.anzahl_verfuegbar === null ? 'unbegrenzt' : `${p.anzahl_verfuegbar} verfügbar`}</p>
            </div>
            <button onClick={() => bearbeitenForm(p)} style={{ ...btn, background: '#f3f4f6', color: '#374151' }}>Ändern</button>
            <button onClick={() => loeschen(p)} style={{ ...btn, background: '#fef2f2', color: '#ef4444' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>delete</span>
            </button>
          </div>
        ))}
        {!form && <button onClick={() => setForm({ ...LEER })} style={{ ...btn, background: 'var(--primary)', color: '#fff', width: '100%', padding: 12, marginTop: 12 }}>+ Neue Prämie</button>}
      </Box>

      {form && (
        <Box title={form.id ? 'Prämie ändern' : 'Neue Prämie'}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Feld label="Name"><input style={inp} value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="z. B. 5 € Verzehrgutschein" /></Feld>
            <Feld label="Beschreibung"><textarea style={{ ...inp, minHeight: 60 }} value={form.beschreibung} onChange={e => setForm({ ...form, beschreibung: e.target.value })} /></Feld>
            <div style={{ display: 'flex', gap: 10 }}>
              <Feld label="Punkte"><input style={inp} inputMode="numeric" value={form.punkte} onChange={e => setForm({ ...form, punkte: e.target.value })} /></Feld>
              <Feld label="Bestand (leer = unbegrenzt)"><input style={inp} inputMode="numeric" value={form.anzahl} onChange={e => setForm({ ...form, anzahl: e.target.value })} /></Feld>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Feld label="Symbol (Material Symbols)"><input style={inp} value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value.toLowerCase() })} placeholder="redeem, restaurant, checkroom …" /></Feld>
              <Feld label="Farbe"><input type="color" style={{ ...inp, padding: 2, height: 40 }} value={HEX.test(form.farbe) ? form.farbe : '#0d631b'} onChange={e => setForm({ ...form, farbe: e.target.value })} /></Feld>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.verfuegbar} onChange={e => setForm({ ...form, verfuegbar: e.target.checked })} />
              Im Shop sichtbar und einlösbar
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={busy} onClick={speichern} style={{ ...btn, background: 'var(--primary)', color: '#fff', flex: 1, padding: 12 }}>{busy ? 'Speichert…' : 'Speichern'}</button>
              <button onClick={() => setForm(null)} style={{ ...btn, background: '#f3f4f6', color: '#374151', padding: 12 }}>Abbrechen</button>
            </div>
          </div>
        </Box>
      )}
      {dialog}
    </div>
  )
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div style={{ background: '#fff', borderRadius: 16, padding: 16, border: '1px solid #f3f4f6' }}>
    <p style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>{title}</p>{children}</div>)
}
function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div style={{ flex: 1 }}><label style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>{label}</label>{children}</div>)
}

const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontFamily: 'Manrope,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '6px 12px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 900, cursor: 'pointer', fontFamily: 'Lexend,sans-serif' }
const titel: React.CSSProperties = { fontFamily: 'Lexend,sans-serif', fontWeight: 700, fontSize: 14 }
const klein: React.CSSProperties = { fontSize: 11, color: '#9ca3af', marginTop: 2 }
const leer: React.CSSProperties = { textAlign: 'center', padding: '16px 0', color: '#9ca3af', fontSize: 13 }
const badge: React.CSSProperties = { marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 99, fontWeight: 900 }
