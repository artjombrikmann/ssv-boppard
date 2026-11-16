import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useBestaetigung } from '../components/Bestaetigung'

// Event-Typen eines Vereins pflegen (Name, Symbol, Farbe, Konfetti). Läuft über die Funktionen aus 04o.
// Der Schlüssel eines Typs bleibt fest, weil Events und Vorlagen darauf zeigen. Umbenannt wird nur der Name.

interface Props { vereinId: string; toast: (msg: string) => void; onGeaendert: () => void }

interface Typ { key: string; label: string; sort: number; farbe: string | null; icon: string | null; verlauf: string | null; deko: boolean | null }
interface Form { key: string | null; label: string; icon: string; farbe: string; farbeGeaendert: boolean; deko: boolean }

const HEX = /^#[0-9a-f]{6}$/i
const LEER: Form = { key: null, label: '', icon: '📅', farbe: '#0d631b', farbeGeaendert: true, deko: false }

export default function VerwaltungTypen({ vereinId, toast, onGeaendert }: Props) {
  const [typen, setTypen] = useState<Typ[]>([])
  const [form, setForm]   = useState<Form | null>(null)
  const [busy, setBusy]   = useState(false)
  const [fragen, dialog] = useBestaetigung()

  useEffect(() => { laden() }, [vereinId])

  async function laden() {
    const { data, error } = await supabase.from('event_typen').select('*').eq('verein_id', vereinId).order('sort')
    if (error) { toast('❌ Typen: ' + error.message); return }
    setTypen((data ?? []) as Typ[])
  }

  function aendern(t: Typ) {
    setForm({
      key: t.key, label: t.label, icon: t.icon ?? '', deko: !!t.deko,
      farbe: t.farbe && HEX.test(t.farbe) ? t.farbe : '#0d631b',
      farbeGeaendert: false,   // ohne Änderung bleibt Farbe und fester Verlauf des Typs erhalten
    })
  }

  async function speichern() {
    if (!form) return
    if (!form.label.trim()) { toast('❌ Bitte einen Namen eingeben'); return }
    setBusy(true)
    const { error } = await supabase.rpc('event_typ_speichern', {
      p_verein: vereinId, p_key: form.key, p_label: form.label, p_icon: form.icon.trim() || null,
      p_farbe: form.farbeGeaendert ? form.farbe : null, p_deko: form.deko,
    })
    setBusy(false)
    if (error) { toast('❌ ' + error.message); return }
    toast('✅ Typ gespeichert')
    setForm(null)
    laden()
    onGeaendert()
  }

  async function loeschen(t: Typ) {
    if (!await fragen(`Typ "${t.label}" löschen?`, { titel: 'Typ löschen?', ok: 'Löschen', gefahr: true })) return
    const { error } = await supabase.rpc('event_typ_loeschen', { p_verein: vereinId, p_key: t.key })
    if (error) { toast('❌ ' + error.message); return }
    toast('🗑️ Typ gelöscht')
    laden()
    onGeaendert()
  }

  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, border: '1px solid #f3f4f6' }}>
      <p style={kopf}>Event-Typen ({typen.length})</p>

      {typen.map(t => (
        <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #f9fafb' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: t.farbe && HEX.test(t.farbe) ? t.farbe : 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
            {t.icon || '📅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontFamily: 'Lexend,sans-serif', fontWeight: 700, fontSize: 14 }}>{t.label}</p>
            <p style={{ fontSize: 11, color: '#9ca3af' }}>{t.deko ? 'mit Konfetti' : 'ohne Konfetti'}</p>
          </div>
          <button onClick={() => aendern(t)} style={{ ...btn, background: '#f3f4f6', color: '#374151' }}>Ändern</button>
          <button onClick={() => loeschen(t)} style={{ ...btn, background: '#fef2f2', color: '#ef4444' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle' }}>delete</span>
          </button>
        </div>
      ))}

      {!form && <button onClick={() => setForm({ ...LEER })} style={{ ...btn, background: 'var(--primary)', color: '#fff', width: '100%', padding: 12, marginTop: 12 }}>+ Neuer Typ</button>}

      {form && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
          <p style={kopf}>{form.key ? 'Typ ändern' : 'Neuer Typ'}</p>
          <Feld label="Name"><input style={inp} value={form.label} maxLength={40} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="z. B. Jugendturnier" /></Feld>
          <div style={{ display: 'flex', gap: 10 }}>
            <Feld label="Symbol (Emoji)"><input style={inp} value={form.icon} maxLength={8} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="⚽" /></Feld>
            <Feld label={form.key && !form.farbeGeaendert ? 'Farbe (unverändert)' : 'Farbe'}>
              <input type="color" style={{ ...inp, padding: 2, height: 40 }} value={form.farbe}
                onChange={e => setForm({ ...form, farbe: e.target.value, farbeGeaendert: true })} />
            </Feld>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.deko} onChange={e => setForm({ ...form, deko: e.target.checked })} />
            Konfetti-Deko im Banner
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={speichern} style={{ ...btn, background: 'var(--primary)', color: '#fff', flex: 1, padding: 12 }}>{busy ? 'Speichert…' : 'Speichern'}</button>
            <button onClick={() => setForm(null)} style={{ ...btn, background: '#f3f4f6', color: '#374151', padding: 12 }}>Abbrechen</button>
          </div>
        </div>
      )}
      {dialog}
    </div>
  )
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div style={{ flex: 1 }}><label style={{ fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>{label}</label>{children}</div>)
}

const kopf: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }
const inp: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, fontFamily: 'Manrope,sans-serif', outline: 'none', background: '#fff', boxSizing: 'border-box' }
const btn: React.CSSProperties = { padding: '6px 12px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 900, cursor: 'pointer', fontFamily: 'Lexend,sans-serif' }
