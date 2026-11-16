import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Mitgliedschaft } from '../types'

interface Props {
  profile: Profile
  mitgliedschaft: Mitgliedschaft
  onTabChange: (tab: string) => void
  onMitgliedschaftNeuLaden: () => Promise<void>
}

interface Artikel {
  id: string
  name: string
  beschreibung: string
  punkte: number
  icon: string
  gradient: string
  verfuegbar: boolean
}

const HEX = /^#[0-9a-f]{6}$/i
function verlauf(farbe: unknown): string {
  const f = typeof farbe === 'string' && HEX.test(farbe) ? farbe : '#0d631b'
  return `linear-gradient(135deg, ${f}, ${f}cc)`
}

export default function Shop({ profile, mitgliedschaft, onMitgliedschaftNeuLaden }: Props) {
  const [selected,  setSelected]  = useState<Artikel | null>(null)
  const [sending,   setSending]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [punkte,    setPunkte]    = useState(mitgliedschaft.punkte ?? 0)
  const [artikel,   setArtikel]   = useState<Artikel[] | null>(null)
  const [adminMail, setAdminMail] = useState('')
  const [fehler,    setFehler]    = useState('')

  useEffect(() => {
    const vid = mitgliedschaft.verein_id
    supabase.from('einstellungen').select('admin_email').eq('verein_id', vid).maybeSingle()
      .then(({ data }) => { if (data?.admin_email) setAdminMail(data.admin_email) })
    supabase.from('preise').select('*').eq('verein_id', vid).eq('verfuegbar', true).order('punkte_kosten')
      .then(({ data }) => setArtikel(((data ?? []) as any[]).map(r => ({
        id: r.id, name: r.name, beschreibung: r.beschreibung ?? '', punkte: r.punkte_kosten,
        icon: r.icon || 'redeem', gradient: verlauf(r.farbe),
        verfuegbar: r.anzahl_verfuegbar === null || r.anzahl_verfuegbar > 0,
      }))))
    // Aktuellen Punktestand laden
    ladePunkte()
  }, [])

  // Guthaben kommt aus der Mitgliedschaft dieses Vereins
  async function holeGuthaben(): Promise<number | null> {
    const { data } = await supabase.from('mitgliedschaften').select('punkte')
      .eq('user_id', profile.id).eq('verein_id', mitgliedschaft.verein_id).single()
    return data ? (data.punkte ?? 0) : null
  }

  async function ladePunkte() {
    const g = await holeGuthaben()
    if (g !== null) setPunkte(g)
    await onMitgliedschaftNeuLaden()
  }

  async function einloesen(artikel: Artikel) {
    if (sending) return
    setFehler('')
    if (punkte < artikel.punkte || !artikel.verfuegbar) return
    setSending(true)

    try {
      // Eine Transaktion auf dem Server: Prämie prüfen, Guthaben prüfen, Punkte abziehen, Anfrage anlegen.
      // Die Admin-Mail verschickt der DB-Trigger (Function shop-anfrage).
      const { error } = await supabase.rpc('shop_einloesen', { p_preis: artikel.id })
      if (error) {
        console.error('Einlösen fehlgeschlagen:', error)
        setFehler(error.message.includes('Nicht genug Punkte') ? 'Nicht genug Punkte.'
          : error.message.includes('ausverkauft') ? 'Diese Prämie ist leider ausverkauft.'
          : 'Das Einlösen hat nicht geklappt. Es wurden keine Punkte abgezogen.')
        await ladePunkte()
        return
      }

      await ladePunkte()
      setSelected(null)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 4000)
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Punkte einlösen</h1>
        <p style={{ color:'#5d5e61', fontSize:13, marginTop:2 }}>Dein Guthaben: <strong style={{ color:'var(--primary)' }}>{punkte.toLocaleString('de')} Pkt</strong></p>
      </div>

      {/* Erfolg Banner */}
      {success && (
        <div style={{ background:'var(--primary-light)', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'var(--primary)' }}>check_circle</span>
          <div>
            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'var(--primary)' }}>Anfrage gesendet!</p>
            <p style={{ fontSize:11, color:'#5d5e61', marginTop:2 }}>Die Punkte wurden abgezogen. Die Geschäftsführung wurde per E-Mail benachrichtigt.</p>
          </div>
        </div>
      )}

      {fehler && (
        <div style={{ background:'#fef2f2', borderRadius:14, padding:'12px 16px', fontSize:13, color:'#ef4444', fontWeight:600 }}>{fehler}</div>
      )}

      {/* Info */}
      <div style={{ background:'#f8faf8', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, border:'1px solid #f3f4f6' }}>
        <span className="material-symbols-outlined" style={{ fontSize:16, color:'#5d5e61', marginTop:1 }}>mail</span>
        <p style={{ fontSize:11, color:'#5d5e61', lineHeight:1.5 }}>
          Bei jeder Einlösung wird automatisch eine E-Mail an <strong>{adminMail || 'die Geschäftsführung'}</strong> gesendet. Die Punkte werden sofort abgezogen.
        </p>
      </div>

      {/* Artikel */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {artikel === null && <p style={{ fontSize:13, color:'#9ca3af' }}>Wird geladen…</p>}
        {artikel?.length === 0 && <p style={{ fontSize:13, color:'#9ca3af' }}>Aktuell sind keine Prämien verfügbar.</p>}
        {(artikel ?? []).map(a => {
          const hatPunkte = punkte >= a.punkte && a.verfuegbar
          const fehlen    = a.punkte - punkte
          return (
            <div key={a.id} style={{ background:'#fff', borderRadius:24, overflow:'hidden', border:'1px solid #f3f4f6', opacity: hatPunkte ? 1 : .85 }}>
              {/* Bild-Bereich */}
              <div style={{ height:80, background:a.gradient, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize:64, color:'rgba(255,255,255,.15)', position:'absolute' }}>{a.icon}</span>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:'#fff', position:'relative', zIndex:1 }}>{a.icon}</span>
                <span style={{ position:'absolute', top:12, right:12, background:'rgba(255,255,255,.2)', backdropFilter:'blur(8px)', color:'#fff', fontSize:11, fontWeight:900, padding:'4px 10px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>
                  {a.punkte} Pkt
                </span>
              </div>
              {/* Info */}
              <div style={{ padding:16 }}>
                <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:15, marginBottom:4 }}>{a.name}</h3>
                <p style={{ fontSize:12, color:'#5d5e61', lineHeight:1.5, marginBottom:12 }}>{a.beschreibung}</p>
                {hatPunkte ? (
                  <button onClick={() => setSelected(a)}
                    style={{ width:'100%', padding:12, background:'var(--primary)', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:13, cursor:'pointer' }}>
                    Jetzt einlösen
                  </button>
                ) : (
                  <div style={{ width:'100%', padding:12, background:'#f3f4f6', borderRadius:12, textAlign:'center', fontSize:12, fontWeight:700, color:'#9ca3af', fontFamily:'Lexend,sans-serif' }}>
                    {a.verfuegbar ? `Noch ${fehlen.toLocaleString('de')} Punkte nötig` : 'Ausverkauft'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Bestätigungs-Modal */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setSelected(null)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:420 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 20px' }} />
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:18, marginBottom:4 }}>{selected.name} einlösen</h2>
            <p style={{ fontSize:13, color:'#5d5e61', marginBottom:16 }}>{selected.beschreibung}</p>

            {/* Kosten-Übersicht */}
            <div style={{ background:'#f8faf8', borderRadius:12, padding:14, marginBottom:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
                <span style={{ color:'#9ca3af' }}>Kosten</span>
                <span style={{ fontWeight:700, color:'var(--primary)' }}>{selected.punkte} Punkte</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
                <span style={{ color:'#9ca3af' }}>Dein Guthaben</span>
                <span style={{ fontWeight:700 }}>{punkte.toLocaleString('de')} Punkte</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0' }}>
                <span style={{ fontWeight:700, color:'#9ca3af' }}>Nach Einlösung</span>
                <span style={{ fontWeight:900, color:'var(--primary)' }}>{(punkte - selected.punkte).toLocaleString('de')} Punkte</span>
              </div>
            </div>

            <div style={{ background:'var(--primary-light)', borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', gap:8 }}>
              <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--primary)' }}>mail</span>
              <p style={{ fontSize:11, color:'var(--primary)', fontWeight:500, lineHeight:1.5 }}>
                Eine E-Mail wird automatisch an die Geschäftsführung gesendet. Deine Punkte werden sofort abgezogen.
              </p>
            </div>

            <button onClick={() => einloesen(selected)} disabled={sending}
              style={{ width:'100%', padding:14, background:'var(--primary)', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer', marginBottom:10 }}>
              {sending ? 'Wird verarbeitet...' : 'Jetzt einlösen & E-Mail senden'}
            </button>
            <button onClick={() => setSelected(null)}
              style={{ width:'100%', padding:12, background:'#f3f4f6', color:'#5d5e61', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}