import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function Rangliste({ profile }: Props) {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('profiles').select('id, name, punkte, schichten_count').order('punkte', { ascending: false }).limit(5)
      .then(({ data }) => { setMembers(data ?? []); setLoading(false) })
  }, [])

  const top3   = members.slice(0, 3)
  const rest   = members.slice(3)
  const myRank = members.findIndex(m => m.id === profile.id) + 1

  const podium = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3
  const podiumConfig = [
    { rang:2, farbe:'#94a3b8', hoehe:80,  schriftGroesse:20 },
    { rang:1, farbe:'#eab308', hoehe:100, schriftGroesse:24 },
    { rang:3, farbe:'#b45309', hoehe:64,  schriftGroesse:18 },
  ]
  const medaillen = ['🥇','🥈','🥉']

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22, color:'#e5e2e1' }}>Rangliste</h1>
        <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13, marginTop:2 }}>Top 5 · Saison 2025</p>
      </div>

      {myRank === 0 && (
        <div style={{ background:'rgba(97,222,138,0.05)', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, border:'1px solid rgba(97,222,138,0.1)' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#61de8a' }}>info</span>
          <p style={{ fontSize:13, color:'#61de8a', fontWeight:600 }}>Du bist noch nicht in den Top 5. Übernimm mehr Schichten um aufzusteigen!</p>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'rgba(229,226,225,0.3)', fontSize:13 }}>Wird geladen...</div>
      ) : (
        <>
          {top3.length === 3 && (
            <div style={{ background:'#1c1b1b', borderRadius:20, padding:'24px 16px 16px', border:'1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.35)', textTransform:'uppercase', letterSpacing:'.08em', textAlign:'center', marginBottom:20 }}>🏆 Top 3</p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1.1fr 1fr', gap:8, alignItems:'flex-end' }}>
                {podium.map((member, idx) => {
                  const cfg = podiumConfig[idx]
                  const isMe = member?.id === profile.id
                  const initials = member?.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                  return (
                    <div key={member?.id ?? idx} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                      <div style={{ position:'relative', marginBottom:8 }}>
                        <div style={{ width:cfg.rang===1?56:46, height:cfg.rang===1?56:46, borderRadius:'50%', background: isMe ? '#27500a' : '#2a2a2a', border:`3px solid ${cfg.farbe}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:cfg.rang===1?18:14, color: isMe ? '#61de8a' : 'rgba(229,226,225,0.6)' }}>
                          {initials}
                        </div>
                        <span style={{ position:'absolute', bottom:-4, right:-4, fontSize:14 }}>{medaillen[cfg.rang-1]}</span>
                      </div>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:cfg.rang===1?13:11, textAlign:'center', marginBottom:2, color:'#e5e2e1' }}>
                        {member?.name?.split(' ')[0]}{isMe?' (Du)':''}
                      </p>
                      <div style={{ width:'100%', background:cfg.farbe+'15', borderRadius:'8px 8px 0 0', height:cfg.hoehe, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderTop:`3px solid ${cfg.farbe}` }}>
                        <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:cfg.schriftGroesse, color:cfg.farbe }}>{member?.punkte?.toLocaleString('de')}</span>
                        <span style={{ fontSize:9, fontWeight:800, color:cfg.farbe, opacity:.7 }}>PKT</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {rest.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rest.map((m, i) => {
                const rang = i + 4
                const isMe = m.id === profile.id
                const initials = m.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                return (
                  <div key={m.id} style={{ background:'#1c1b1b', borderRadius:14, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, border: isMe ? '1.5px solid rgba(97,222,138,0.3)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:16, color:'rgba(229,226,225,0.35)', minWidth:24, textAlign:'center' }}>#{rang}</span>
                    <div style={{ width:36, height:36, borderRadius:'50%', background: isMe ? '#27500a' : '#2a2a2a', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:12, color: isMe ? '#61de8a' : 'rgba(229,226,225,0.5)', flexShrink:0 }}>
                      {initials}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#e5e2e1' }}>{m.name}{isMe?' (Du)':''}</p>
                      <p style={{ fontSize:11, color:'rgba(229,226,225,0.35)' }}>{m.schichten_count??0} Schichten</p>
                    </div>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:15, color:'#61de8a' }}>{m.punkte?.toLocaleString('de')}</span>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ background:'rgba(97,222,138,0.05)', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start', border:'1px solid rgba(97,222,138,0.1)' }}>
            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#61de8a', marginTop:1 }}>info</span>
            <p style={{ fontSize:11, color:'#61de8a', fontWeight:500, lineHeight:1.5 }}>
              Die Rangliste zeigt die Top 5 Mitglieder. Dein Rang wird nach jeder vergebenen Schicht aktualisiert.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
