import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schicht } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function Home({ profile, onTabChange }: Props) {
  const [shifts,    setShifts]    = useState<Schicht[]>([])
  const [rank,      setRank]      = useState<string>('–')
  const [nextShift, setNextShift] = useState<Schicht | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sh } = await supabase.from('schichten').select('*, veranstaltungen(name, datum), kategorien(name)').order('startzeit')
    setShifts(sh ?? [])
    const { data: bk } = await supabase.from('schichtbelegungen').select('*, schichten(bezeichnung,startzeit,endzeit,punkte,veranstaltungen(name))').eq('mitglied_id', profile.id).order('created_at', { ascending: false }).limit(1)
    if (bk && bk.length > 0) setNextShift(bk[0].schichten as any)
    const { data: members } = await supabase.from('profiles').select('punkte').order('punkte', { ascending: false })
    if (members) {
      const pos = members.findIndex(m => m.punkte <= (profile.punkte ?? 0))
      setRank('#' + (pos + 1))
    }
  }

  const pts = profile.punkte ?? 0
  const nextBadgeReq = pts < 10 ? 10 : pts < 50 ? 50 : pts < 150 ? 150 : 300
  const progress = Math.min(100, Math.round((pts / nextBadgeReq) * 100))
  const nextBadgeName = pts < 10 ? 'Vereinshelfer' : pts < 50 ? 'Schichtprofi' : pts < 150 ? 'Vereinsheld' : 'Legende'

  const offeneSchichten = shifts.filter(sh => sh.belegt < sh.plaetze)
  const grouped = offeneSchichten.reduce((acc, sh) => {
    const evName = (sh as any).veranstaltungen?.name ?? 'Ohne Veranstaltung'
    const evDatum = (sh as any).veranstaltungen?.datum ?? ''
    const key = evName
    if (!acc[key]) acc[key] = { name: evName, datum: evDatum, schichten: [] }
    acc[key].schichten.push(sh)
    return acc
  }, {} as Record<string, { name: string; datum: string; schichten: Schicht[] }>)

  const groupedList = Object.values(grouped)

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22, color:'#e5e2e1' }}>
          Willkommen, {(profile.display_name || profile.name)?.split(' ')[0]} 👋
        </h1>
        <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13, marginTop:2, fontWeight:500 }}>Bereit für den nächsten Einsatz?</p>
      </div>

      {/* Punkte Hero */}
      <div style={{ background:'linear-gradient(135deg, #0a1a0f 0%, #0d2d10 100%)', borderRadius:24, padding:24, color:'#fff', position:'relative', overflow:'hidden', border:'1px solid rgba(97,222,138,0.15)' }}>
        <div style={{ position:'absolute', right:-20, top:-20, width:120, height:120, borderRadius:'50%', background:'rgba(97,222,138,0.05)' }} />
        <div style={{ position:'absolute', right:16, bottom:16, opacity:.06 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:90 }}>workspace_premium</span>
        </div>
        <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', color:'rgba(97,222,138,0.7)', marginBottom:4 }}>Gesamtpunkte</p>
        <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
          <span style={{ fontFamily:'Lexend,sans-serif', fontSize:48, fontWeight:900, lineHeight:1, color:'#61de8a' }}>{pts.toLocaleString('de')}</span>
          <span style={{ fontSize:20, fontWeight:700, color:'rgba(229,226,225,0.5)' }}>Pkt</span>
        </div>
        <div style={{ marginTop:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, fontWeight:700, color:'rgba(229,226,225,0.5)', marginBottom:6 }}>
            <span>Nächster Badge: {nextBadgeName}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height:8, background:'rgba(255,255,255,.1)', borderRadius:99, overflow:'hidden' }}>
            <div style={{ height:'100%', background:'#61de8a', borderRadius:99, width:`${progress}%`, transition:'width .5s' }} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ background:'#1c1b1b', borderRadius:16, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:24, color:'#61de8a' }}>leaderboard</span>
          <p style={{ fontFamily:'Lexend,sans-serif', fontSize:24, fontWeight:900, marginTop:4, color:'#e5e2e1' }}>{rank}</p>
          <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.35)', textTransform:'uppercase', letterSpacing:'.06em' }}>Rang</p>
        </div>
        <div style={{ background:'#1c1b1b', borderRadius:16, padding:16, border:'1px solid rgba(255,255,255,0.06)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:24, color:'#61de8a' }}>calendar_today</span>
          <p style={{ fontFamily:'Lexend,sans-serif', fontSize:24, fontWeight:900, marginTop:4, color:'#e5e2e1' }}>{profile.schichten_count ?? 0}</p>
          <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.35)', textTransform:'uppercase', letterSpacing:'.06em' }}>Schichten</p>
        </div>
      </div>

      {/* Nächste Schicht */}
      {nextShift && (
        <div style={{ background:'#1c1b1b', borderRadius:16, padding:16, border:'1px solid rgba(97,222,138,0.1)' }}>
          <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.35)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Deine nächste Schicht</p>
          <div style={{ display:'flex', gap:14, alignItems:'center' }}>
            <div style={{ width:52, height:52, background:'rgba(97,222,138,0.08)', borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderBottom:'3px solid #61de8a', flexShrink:0 }}>
              <span style={{ fontSize:8, fontWeight:900, color:'#61de8a', textTransform:'uppercase' }}>nächste</span>
              <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'#61de8a' }}>event</span>
            </div>
            <div>
              <p style={{ fontSize:10, fontWeight:900, color:'#61de8a', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{(nextShift as any)?.veranstaltungen?.name}</p>
              <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:15, color:'#e5e2e1' }}>{nextShift.bezeichnung}</h3>
              <span style={{ fontSize:11, color:'rgba(229,226,225,0.4)', display:'flex', alignItems:'center', gap:3, marginTop:4 }}>
                <span className="material-symbols-outlined" style={{ fontSize:13 }}>schedule</span>
                {nextShift.startzeit?.slice(0,5)}–{nextShift.endzeit?.slice(0,5)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Offene Schichten */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#e5e2e1' }}>Offene Schichten</p>
          <button onClick={() => onTabChange('marktplatz')}
            style={{ background:'none', border:'none', color:'#61de8a', fontSize:12, fontWeight:900, cursor:'pointer', fontFamily:'Lexend,sans-serif' }}>
            Alle →
          </button>
        </div>

        {groupedList.length === 0 ? (
          <div style={{ textAlign:'center', padding:'24px 0', color:'rgba(229,226,225,0.3)', fontSize:13 }}>
            Keine offenen Schichten 🎉
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {groupedList.map(group => (
              <div key={group.name}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span className="material-symbols-outlined icon-fill" style={{ fontSize:16, color:'#61de8a' }}>event</span>
                  <div style={{ flex:1 }}>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:13, color:'#e5e2e1' }}>{group.name}</span>
                    {group.datum && <span style={{ fontSize:11, color:'rgba(229,226,225,0.35)', marginLeft:8 }}>{new Date(group.datum).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })}</span>}
                  </div>
                  <span style={{ fontSize:10, fontWeight:900, color:'#61de8a', background:'rgba(97,222,138,0.08)', padding:'2px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif', border:'1px solid rgba(97,222,138,0.15)' }}>
                    {group.schichten.length} offen
                  </span>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:8, paddingLeft:4 }}>
                  {group.schichten.slice(0, 3).map(sh => (
                    <ShiftCard key={sh.id} shift={sh} onTabChange={onTabChange} />
                  ))}
                  {group.schichten.length > 3 && (
                    <button onClick={() => onTabChange('marktplatz')}
                      style={{ background:'none', border:'1px dashed rgba(255,255,255,0.1)', borderRadius:10, padding:'8px', fontSize:11, fontWeight:700, color:'rgba(229,226,225,0.3)', cursor:'pointer', fontFamily:'Manrope,sans-serif' }}>
                      + {group.schichten.length - 3} weitere Schichten ansehen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ShiftCard({ shift, onTabChange }: { shift: Schicht; onTabChange: (t: string) => void }) {
  const frei = shift.plaetze - shift.belegt
  return (
    <div style={{ background:'#1c1b1b', borderRadius:14, padding:'12px 14px', border:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
      <div style={{ flex:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
          <span style={{ background:'rgba(97,222,138,0.08)', color:'#61de8a', fontSize:9, fontWeight:900, padding:'2px 7px', borderRadius:99, fontFamily:'Lexend,sans-serif', border:'1px solid rgba(97,222,138,0.15)' }}>
            {shift.punkte} Pkt
          </span>
          {(shift as any).kategorien?.name && (
            <span style={{ background:'rgba(255,255,255,0.05)', color:'rgba(229,226,225,0.5)', fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:99 }}>
              {(shift as any).kategorien.name}
            </span>
          )}
        </div>
        <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'#e5e2e1' }}>{shift.bezeichnung}</p>
        <div style={{ display:'flex', gap:10, marginTop:3 }}>
          <span style={{ fontSize:11, color:'rgba(229,226,225,0.4)', display:'flex', alignItems:'center', gap:2 }}>
            <span className="material-symbols-outlined" style={{ fontSize:12 }}>schedule</span>
            {shift.startzeit?.slice(0,5)}–{shift.endzeit?.slice(0,5)}
          </span>
          <span style={{ fontSize:11, color:'rgba(229,226,225,0.4)', display:'flex', alignItems:'center', gap:2 }}>
            <span className="material-symbols-outlined" style={{ fontSize:12 }}>group</span>
            {frei} frei
          </span>
        </div>
      </div>
      <button onClick={() => onTabChange('marktplatz')}
        style={{ background:'#61de8a', color:'#00391a', border:'none', borderRadius:10, padding:'7px 12px', fontSize:11, fontWeight:900, cursor:'pointer', fontFamily:'Lexend,sans-serif', whiteSpace:'nowrap' }}>
        Ansehen
      </button>
    </div>
  )
}
