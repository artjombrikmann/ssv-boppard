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
  accent: string
}

const ARTIKEL: Artikel[] = [
  { id:1, name:'5 € Verzehrgutschein',  beschreibung:'Einlösbar bei jedem Heimspiel am Hauptkiosk des SSV Boppard.', punkte:50,  icon:'restaurant', gradient:'linear-gradient(135deg, #0a1a0f, #0d2d10)', accent:'#61de8a' },
  { id:2, name:'10 € Fanshop-Gutschein', beschreibung:'Einlösbar im offiziellen SSV Boppard Online-Fanshop.',         punkte:200, icon:'checkroom',  gradient:'linear-gradient(135deg, #0a0a1a, #0f0f3d)', accent:'#92ccff' },
  { id:3, name:'Heimtrikot 2025',        beschreibung:'Das offizielle Heimtrikot des SSV Boppard mit Vereinswappen.',  punkte:500, icon:'emoji_events', gradient:'linear-gradient(135deg, #1a0a00, #3d1a00)', accent:'#ffd700' },
]

export default function Shop({ profile }: Props) {
  const [selected, setSelected] = useState<Artikel | null>(null)
  const [sending,  setSending]  = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [punkte,   setPunkte]   = useState(profile.punkte ?? 0)

  useEffect(() => {
    supabase.from('profiles').select('punkte').eq('id', profile.id).single().then(({ data }) => { if (data) setPunkte(data.punkte) })
  }, [])

  async function einloesen(artikel: Artikel) {
    if (punkte < artikel.punkte) return
    setSending(true)
    const neuePunkte = punkte - artikel.punkte
    await supabase.from('profiles').update({ punkte: neuePunkte }).eq('id', profile.id)
    await supabase.from('gutschein_anfragen').insert({ mitglied_id: profile.id, typ: artikel.name, punkte: artikel.punkte, status: 'genehmigt' })
    setPunkte(neuePunkte); setSelected(null); setSuccess(true); setSending(false)
    setTimeout(() => setSuccess(false), 4000)
  }

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22, color:'#e5e2e1' }}>Punkte einlösen</h1>
        <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13, marginTop:2 }}>Dein Guthaben: <strong style={{ color:'#61de8a' }}>{punkte.toLocaleString('de')} Pkt</strong></p>
      </div>

      {success && (
        <div style={{ background:'rgba(97,222,138,0.08)', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(97,222,138,0.2)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#61de8a' }}>check_circle</span>
          <div>
            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'#61de8a' }}>Anfrage gesendet!</p>
            <p style={{ fontSize:11, color:'rgba(229,226,225,0.5)', marginTop:2 }}>Die Punkte wurden abgezogen. Die Geschäftsführung wurde benachrichtigt.</p>
          </div>
        </div>
      )}

      <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, border:'1px solid rgba(255,255,255,0.06)' }}>
        <span className="material-symbols-outlined" style={{ fontSize:16, color:'rgba(229,226,225,0.35)', marginTop:1 }}>mail</span>
        <p style={{ fontSize:11, color:'rgba(229,226,225,0.4)', lineHeight:1.5 }}>
          Bei jeder Einlösung wird automatisch eine E-Mail an die Geschäftsführung gesendet. Die Punkte werden sofort abgezogen.
        </p>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        {ARTIKEL.map(a => {
          const hatPunkte = punkte >= a.punkte
          const fehlen = a.punkte - punkte
          return (
            <div key={a.id} style={{ background:'#1c1b1b', borderRadius:24, overflow:'hidden', border:`1px solid ${a.accent}15`, opacity: hatPunkte ? 1 : .7 }}>
              <div style={{ height:80, background:a.gradient, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', borderBottom:`1px solid ${a.accent}20` }}>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize:64, color:'rgba(255,255,255,.08)', position:'absolute' }}>{a.icon}</span>
                <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:a.accent, position:'relative', zIndex:1 }}>{a.icon}</span>
                <span style={{ position:'absolute', top:12, right:12, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(8px)', color:a.accent, fontSize:11, fontWeight:900, padding:'4px 10px', borderRadius:99, fontFamily:'Lexend,sans-serif', border:`1px solid ${a.accent}30` }}>
                  {a.punkte} Pkt
                </span>
              </div>
              <div style={{ padding:16 }}>
                <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:15, marginBottom:4, color:'#e5e2e1' }}>{a.name}</h3>
                <p style={{ fontSize:12, color:'rgba(229,226,225,0.4)', lineHeight:1.5, marginBottom:12 }}>{a.beschreibung}</p>
                {hatPunkte ? (
                  <button onClick={() => setSelected(a)}
                    style={{ width:'100%', padding:12, background:'#61de8a', color:'#00391a', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:13, cursor:'pointer' }}>
                    Jetzt einlösen
                  </button>
                ) : (
                  <div style={{ width:'100%', padding:12, background:'rgba(255,255,255,0.04)', borderRadius:12, textAlign:'center', fontSize:12, fontWeight:700, color:'rgba(229,226,225,0.3)', fontFamily:'Lexend,sans-serif' }}>
                    Noch {fehlen.toLocaleString('de')} Punkte nötig
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setSelected(null)}>
          <div style={{ background:'#1c1b1b', borderRadius:'20px 20px 0 0', padding:24, width:'100%', maxWidth:480, border:'1px solid rgba(255,255,255,0.08)', borderBottom:'none' }} onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'rgba(255,255,255,0.2)', borderRadius:2, margin:'0 auto 20px' }} />
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:18, marginBottom:4, color:'#e5e2e1' }}>{selected.name} einlösen</h2>
            <p style={{ fontSize:13, color:'rgba(229,226,225,0.5)', marginBottom:16 }}>{selected.beschreibung}</p>
            <div style={{ background:'rgba(255,255,255,0.04)', borderRadius:12, padding:14, marginBottom:16, border:'1px solid rgba(255,255,255,0.06)' }}>
              {[['Kosten', `${selected.punkte} Punkte`, selected.accent], ['Dein Guthaben', `${punkte.toLocaleString('de')} Punkte`, '#e5e2e1'], ['Nach Einlösung', `${(punkte-selected.punkte).toLocaleString('de')} Punkte`, '#61de8a']].map(([l, v, c]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'6px 0', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color:'rgba(229,226,225,0.4)' }}>{l}</span>
                  <span style={{ fontWeight:700, color: c as string }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ background:'rgba(97,222,138,0.05)', borderRadius:10, padding:'10px 14px', marginBottom:16, display:'flex', gap:8, border:'1px solid rgba(97,222,138,0.1)' }}>
              <span className="material-symbols-outlined" style={{ fontSize:16, color:'#61de8a' }}>mail</span>
              <p style={{ fontSize:11, color:'#61de8a', fontWeight:500, lineHeight:1.5 }}>Eine E-Mail wird automatisch an die Geschäftsführung gesendet. Deine Punkte werden sofort abgezogen.</p>
            </div>
            <button onClick={() => einloesen(selected)} disabled={sending}
              style={{ width:'100%', padding:14, background:'#61de8a', color:'#00391a', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer', marginBottom:10 }}>
              {sending ? 'Wird verarbeitet...' : 'Jetzt einlösen & E-Mail senden'}
            </button>
            <button onClick={() => setSelected(null)}
              style={{ width:'100%', padding:12, background:'rgba(255,255,255,0.05)', color:'rgba(229,226,225,0.5)', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
