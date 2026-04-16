import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function Rangliste({ profile }: Props) {
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, name, punkte, schichten_count')
      .order('punkte', { ascending: false })
      .limit(5)
      .then(({ data }) => { setMembers(data ?? []); setLoading(false) })
  }, [])

  const top3    = members.slice(0, 3)
  const rest    = members.slice(3)
  const myRank  = members.findIndex(m => m.id === profile.id) + 1

  // Podium-Reihenfolge: 2. – 1. – 3.
  const podium = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3

  const podiumConfig = [
    { rang: 2, farbe:'#94a3b8', hoehe:80,  schriftGroesse:20 },
    { rang: 1, farbe:'#eab308', hoehe:100, schriftGroesse:24 },
    { rang: 3, farbe:'#b45309', hoehe:64,  schriftGroesse:18 },
  ]

  const medaillen = ['🥇','🥈','🥉']

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Rangliste</h1>
        <p style={{ color:'#5d5e61', fontSize:13, marginTop:2 }}>Top 5 · Saison 2025</p>
      </div>

      {/* Eigener Rang (falls nicht in Top 5) */}
      {myRank === 0 && (
        <div style={{ background:'#e8f5ee', borderRadius:14, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:20, color:'#0d631b' }}>info</span>
          <p style={{ fontSize:13, color:'#0d631b', fontWeight:600 }}>Du bist noch nicht in den Top 5. Übernimm mehr Schichten um aufzusteigen!</p>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af', fontSize:13 }}>Wird geladen...</div>
      ) : (
        <>
          {/* Podium */}
          {top3.length === 3 && (
            <div style={{ background:'#fff', borderRadius:20, padding:'24px 16px 16px', border:'1px solid #f3f4f6' }}>
              <p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.08em', textAlign:'center', marginBottom:20 }}>
                🏆 Top 3
              </p>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1.1fr 1fr', gap:8, alignItems:'flex-end' }}>
                {podium.map((member, idx) => {
                  const cfg    = podiumConfig[idx]
                  const isMe   = member?.id === profile.id
                  const initials = member?.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                  return (
                    <div key={member?.id ?? idx} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
                      {/* Avatar */}
                      <div style={{ position:'relative', marginBottom:8 }}>
                        <div style={{ width: cfg.rang === 1 ? 56 : 46, height: cfg.rang === 1 ? 56 : 46, borderRadius:'50%', background: isMe ? '#0d631b' : '#f3f4f6', border:`3px solid ${cfg.farbe}`, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize: cfg.rang === 1 ? 18 : 14, color: isMe ? '#fff' : '#5d5e61' }}>
                          {initials}
                        </div>
                        <span style={{ position:'absolute', bottom:-4, right:-4, fontSize:14 }}>{medaillen[cfg.rang - 1]}</span>
                      </div>
                      {/* Name */}
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize: cfg.rang === 1 ? 13 : 11, textAlign:'center', marginBottom:2 }}>
                        {member?.name?.split(' ')[0]}{isMe ? ' (Du)' : ''}
                      </p>
                      {/* Punkte-Balken */}
                      <div style={{ width:'100%', background: cfg.farbe + '22', borderRadius:'8px 8px 0 0', height:cfg.hoehe, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderTop:`3px solid ${cfg.farbe}` }}>
                        <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:cfg.schriftGroesse, color:cfg.farbe }}>
                          {member?.punkte?.toLocaleString('de')}
                        </span>
                        <span style={{ fontSize:9, fontWeight:800, color:cfg.farbe, opacity:.7 }}>PKT</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plätze 4 & 5 */}
          {rest.length > 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {rest.map((m, i) => {
                const rang   = i + 4
                const isMe   = m.id === profile.id
                const initials = m.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                return (
                  <div key={m.id} style={{ background:'#fff', borderRadius:14, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, border: isMe ? '2px solid #0d631b' : '1px solid #f3f4f6' }}>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:16, color:'#9ca3af', minWidth:24, textAlign:'center' }}>#{rang}</span>
                    <div style={{ width:36, height:36, borderRadius:'50%', background: isMe ? '#0d631b' : '#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:12, color: isMe ? '#fff' : '#5d5e61', flexShrink:0 }}>
                      {initials}
                    </div>
                    <div style={{ flex:1 }}>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>
                        {m.name}{isMe ? ' (Du)' : ''}
                      </p>
                      <p style={{ fontSize:11, color:'#5d5e61' }}>{m.schichten_count ?? 0} Schichten</p>
                    </div>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:15, color:'#0d631b' }}>
                      {m.punkte?.toLocaleString('de')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Info */}
          <div style={{ background:'#e8f5ee', borderRadius:12, padding:'10px 14px', display:'flex', gap:8, alignItems:'flex-start' }}>
            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b', marginTop:1 }}>info</span>
            <p style={{ fontSize:11, color:'#0d631b', fontWeight:500, lineHeight:1.5 }}>
              Die Rangliste zeigt die Top 5 Mitglieder der aktuellen Saison. Dein Rang wird nach jeder vergebenen Schicht aktualisiert.
            </p>
          </div>
        </>
      )}
    </div>
  )
}