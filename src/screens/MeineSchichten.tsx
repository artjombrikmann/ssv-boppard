import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schichtbelegung } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function MeineSchichten({ profile }: Props) {
  const [bookings, setBookings] = useState<Schichtbelegung[]>([])
  const [tab, setTab]           = useState<'kommend' | 'vergangen'>('kommend')
  const [loading, setLoading]   = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase
      .from('schichtbelegungen')
      .select('*, schichten(bezeichnung, startzeit, endzeit, punkte, veranstaltungen(name))')
      .eq('mitglied_id', profile.id)
      .order('created_at', { ascending: false })
    setBookings(data ?? [])
    setLoading(false)
  }

  async function abmelden(b: Schichtbelegung) {
    await supabase.from('schichtbelegungen').delete().eq('id', b.id)
    if (b.schicht_id) {
      await supabase.from('schichten').update({
        belegt: Math.max(0, ((b.schichten as any)?.belegt ?? 1) - 1)
      }).eq('id', b.schicht_id)
    }
    loadData()
  }

  const kommend  = bookings.filter(b => !b.punkte_vergeben)
  const vergangen = bookings.filter(b => b.punkte_vergeben)
  const anzeige  = tab === 'kommend' ? kommend : vergangen

  const gesamtPunkte = vergangen.reduce((sum, b) => sum + (b.schichten?.punkte ?? 0), 0)

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Meine Schichten</h1>
        <p style={{ color:'#5d5e61', fontSize:13, marginTop:2 }}>Deine Einsätze im Überblick.</p>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
        <div style={{ background:'#0d631b', borderRadius:16, padding:14, color:'#fff' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, opacity:.8 }}>calendar_today</span>
          <p style={{ fontFamily:'Lexend,sans-serif', fontSize:22, fontWeight:900, marginTop:4 }}>{kommend.length}</p>
          <p style={{ fontSize:10, fontWeight:800, opacity:.8, textTransform:'uppercase', letterSpacing:'.06em' }}>Kommende</p>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:14, border:'1px solid #f3f4f6' }}>
          <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'#0d631b' }}>workspace_premium</span>
          <p style={{ fontFamily:'Lexend,sans-serif', fontSize:22, fontWeight:900, marginTop:4, color:'#0d631b' }}>{gesamtPunkte}</p>
          <p style={{ fontSize:10, fontWeight:800, color:'#5d5e61', textTransform:'uppercase', letterSpacing:'.06em' }}>Verdiente Pkt</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#eceeec', borderRadius:14, padding:4 }}>
        <button onClick={() => setTab('kommend')}
          style={{ flex:1, padding:'8px 0', borderRadius:10, border:'none', background: tab === 'kommend' ? '#fff' : 'transparent', color: tab === 'kommend' ? '#0d631b' : '#5d5e61', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:12, cursor:'pointer', boxShadow: tab === 'kommend' ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition:'all .15s' }}>
          Kommend ({kommend.length})
        </button>
        <button onClick={() => setTab('vergangen')}
          style={{ flex:1, padding:'8px 0', borderRadius:10, border:'none', background: tab === 'vergangen' ? '#fff' : 'transparent', color: tab === 'vergangen' ? '#0d631b' : '#5d5e61', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:12, cursor:'pointer', boxShadow: tab === 'vergangen' ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition:'all .15s' }}>
          Vergangen ({vergangen.length})
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'32px 0', color:'#9ca3af', fontSize:13 }}>Wird geladen...</div>
      ) : anzeige.length === 0 ? (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>
          <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8 }}>
            {tab === 'kommend' ? 'calendar_today' : 'history'}
          </span>
          <p style={{ fontSize:13 }}>
            {tab === 'kommend' ? 'Noch keine Schichten gebucht.' : 'Noch keine abgeschlossenen Schichten.'}
          </p>
          {tab === 'kommend' && (
            <button onClick={() => {}} style={{ marginTop:12, background:'#0d631b', color:'#fff', border:'none', borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:900, cursor:'pointer', fontFamily:'Lexend,sans-serif' }}>
              Zum Marktplatz →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {anzeige.map(b => (
            <SchichtCard key={b.id} booking={b} tab={tab} onAbmelden={() => abmelden(b)} />
          ))}
        </div>
      )}
    </div>
  )
}

function SchichtCard({ booking: b, tab, onAbmelden }: { booking: Schichtbelegung; tab: string; onAbmelden: () => void }) {
  const [confirm, setConfirm] = useState(false)

  return (
    <div style={{ background:'#fff', borderRadius:16, border: tab === 'kommend' ? '1px solid #e8f5ee' : '1px solid #f3f4f6', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px' }}>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          {/* Datum-Box */}
          <div style={{ width:48, height:48, background:'#e8f5ee', borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderBottom:'3px solid #0d631b', flexShrink:0 }}>
            <span className="material-symbols-outlined icon-fill" style={{ fontSize:22, color:'#0d631b' }}>event</span>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{b.schichten?.bezeichnung}</h3>
              <span style={{ background:'#e8f5ee', color:'#0d631b', fontSize:10, fontWeight:900, padding:'2px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>
                +{b.schichten?.punkte} Pkt
              </span>
            </div>
            <p style={{ fontSize:11, color:'#5d5e61', marginTop:3 }}>{b.schichten?.veranstaltungen?.name}</p>
            <p style={{ fontSize:11, color:'#5d5e61', display:'flex', alignItems:'center', gap:3, marginTop:2 }}>
              <span className="material-symbols-outlined" style={{ fontSize:12 }}>schedule</span>
              {b.schichten?.startzeit?.slice(0,5)} – {b.schichten?.endzeit?.slice(0,5)}
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'10px 16px 14px', borderTop:'1px solid #f9fafb', display:'flex', gap:8 }}>
        {b.punkte_vergeben ? (
          <span style={{ flex:1, textAlign:'center', background:'#e8f5ee', color:'#0d631b', fontSize:11, fontWeight:900, padding:'8px', borderRadius:10, fontFamily:'Lexend,sans-serif' }}>
            ✓ Punkte vergeben
          </span>
        ) : (
          <span style={{ flex:1, textAlign:'center', background:'#fffbeb', color:'#b45309', fontSize:11, fontWeight:900, padding:'8px', borderRadius:10, fontFamily:'Lexend,sans-serif' }}>
            ⏳ Ausstehend
          </span>
        )}
        {!b.punkte_vergeben && !confirm && (
          <button onClick={() => setConfirm(true)}
            style={{ flex:1, background:'#fef2f2', color:'#ef4444', border:'none', borderRadius:10, fontSize:11, fontWeight:900, padding:'8px', cursor:'pointer', fontFamily:'Lexend,sans-serif' }}>
            Abmelden
          </button>
        )}
        {confirm && (
          <>
            <button onClick={onAbmelden}
              style={{ flex:1, background:'#ef4444', color:'#fff', border:'none', borderRadius:10, fontSize:11, fontWeight:900, padding:'8px', cursor:'pointer', fontFamily:'Lexend,sans-serif' }}>
              Ja, abmelden
            </button>
            <button onClick={() => setConfirm(false)}
              style={{ flex:1, background:'#f3f4f6', color:'#5d5e61', border:'none', borderRadius:10, fontSize:11, fontWeight:900, padding:'8px', cursor:'pointer', fontFamily:'Lexend,sans-serif' }}>
              Abbrechen
            </button>
          </>
        )}
      </div>
    </div>
  )
}