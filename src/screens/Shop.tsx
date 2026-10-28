import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Einstellungen } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

interface Artikel {
  id: number
  name: string
  beschreibung: string
  punkte: number
  icon: string
  gradient: string
}

const ARTIKEL: Artikel[] = [
  { id: 1, name: '5 € Verzehrgutschein',  beschreibung: 'Einlösbar bei jedem Heimspiel am Hauptkiosk des SSV Boppard.', punkte: 50,  icon: 'restaurant', gradient: 'linear-gradient(135deg, #166534, #15803d)' },
  { id: 2, name: '10 € Fanshop-Gutschein', beschreibung: 'Einlösbar im offiziellen SSV Boppard Online-Fanshop.',          punkte: 200, icon: 'checkroom',  gradient: 'linear-gradient(135deg, #1e3a5f, #1d4ed8)' },
  { id: 3, name: 'Heimtrikot 2025',        beschreibung: 'Das offizielle Heimtrikot des SSV Boppard mit Vereinswappen.',  punkte: 500, icon: 'emoji_events', gradient: 'linear-gradient(135deg, #92400e, #d97706)' },
]

const ADMIN_MAIL = 'geschaeftsfuehrung@ssv-boppard.de'

export default function Shop({ profile }: Props) {
  const [selected,  setSelected]  = useState<Artikel | null>(null)
  const [sending,   setSending]   = useState(false)
  const [success,   setSuccess]   = useState(false)
  const [punkte,    setPunkte]    = useState(profile.punkte ?? 0)
  const [settings,  setSettings]  = useState<Einstellungen | null>(null)
  const [fehler,    setFehler]    = useState('')

  useEffect(() => {
    supabase.from('einstellungen').select('*').single().then(({ data }) => { if (data) setSettings(data) })
    // Aktuellen Punktestand laden
    supabase.from('profiles').select('punkte').eq('id', profile.id).single().then(({ data }) => {
      if (data) setPunkte(data.punkte)
    })
  }, [])

  async function ladePunkte() {
    const { data } = await supabase.from('profiles').select('punkte').eq('id', profile.id).single()
    if (data) setPunkte(data.punkte ?? 0)
  }

  async function einloesen(artikel: Artikel) {
    if (sending) return
    setFehler('')
    if (punkte < artikel.punkte) return
    setSending(true)

    try {
      // 1. Punkte abziehen (die RPC prüft das Guthaben nicht, daher vorher frisch aus der DB laden)
      const { data: aktuell } = await supabase.from('profiles').select('punkte').eq('id', profile.id).single()
      const guthaben = aktuell?.punkte ?? 0
      if (guthaben < artikel.punkte) {
        setPunkte(guthaben)
        setFehler('Nicht genug Punkte.')
        return
      }

      const { error: abzugError } = await supabase.rpc('punkte_abziehen', {
        user_id: profile.id,
        amount: artikel.punkte,
      })
      if (abzugError) {
        console.error('Punkteabzug fehlgeschlagen:', abzugError)
        setFehler('Die Punkte konnten nicht abgezogen werden. Es wurde nichts eingelöst.')
        return
      }

      // 2. Erst nach erfolgreichem Abzug die Anfrage speichern
      //    (der DB-Trigger trigger_gutschein_mail verschickt die Mail an den Admin)
      const { error: insertError } = await supabase.from('gutschein_anfragen').insert({
        mitglied_id: profile.id,
        typ: artikel.name,
        punkte: artikel.punkte,
        status: 'offen',
      })
      if (insertError) {
        console.error('Anfrage speichern fehlgeschlagen:', insertError)
        setFehler('Die Punkte wurden abgezogen, aber die Anfrage konnte nicht gespeichert werden. Bitte melde dich bei der Geschäftsführung.')
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
        <p style={{ color:'#5d5e61', fontSize:13, marginTop:2 }}>Dein Guthaben: <strong style={{ color:'#0d631b' }}>{punkte.toLocaleString('de')} Pkt</strong></p>
      </div>

      {/* Erfolg Banner */}
      {success && (
        <div style={{ background:'#e8f5ee', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#0d631b' }}>check_circle</span>
          <div>
            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'#0d631b' }}>Anfrage gesendet!</p>
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
          Bei jeder Einlösung wird automatisch eine E-Mail an <strong>{ADMIN_MAIL}</strong> gesendet. Die Punkte werden sofort abgezogen.
        </p>
      </div>

      {/* Artikel */}
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {ARTIKEL.map(a => {
          const hatPunkte = punkte >= a.punkte
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
                    style={{ width:'100%', padding:12, background:'#0d631b', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:13, cursor:'pointer' }}>
                    Jetzt einlösen
                  </button>
                ) : (
                  <div style={{ width:'100%', padding:12, background:'#f3f4f6', borderRadius:12, textAlign:'center', fontSize:12, fontWeight:700, color:'#9ca3af', fontFamily:'Lexend,sans-serif' }}>
                    Noch {fehlen.toLocaleString('de')} Punkte nötig
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
                <span style={{ fontWeight:700, color:'#0d631b' }}>{selected.punkte} Punkte</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid #f3f4f6' }}>
                <span style={{ color:'#9ca3af' }}>Dein Guthaben</span>
                <span style={{ fontWeight:700 }}>{punkte.toLocaleString('de')} Punkte</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0' }}>
                <span style={{ fontWeight:700, color:'#9ca3af' }}>Nach Einlösung</span>
                <span style={{ fontWeight:900, color:'#0d631b' }}>{(punkte - selected.punkte).toLocaleString('de')} Punkte</span>
              </div>
            </div>

            <div style={{ background:'#e8f5ee', borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', gap:8 }}>
              <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b' }}>mail</span>
              <p style={{ fontSize:11, color:'#0d631b', fontWeight:500, lineHeight:1.5 }}>
                Eine E-Mail wird automatisch an die Geschäftsführung gesendet. Deine Punkte werden sofort abgezogen.
              </p>
            </div>

            <button onClick={() => einloesen(selected)} disabled={sending}
              style={{ width:'100%', padding:14, background:'#0d631b', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer', marginBottom:10 }}>
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