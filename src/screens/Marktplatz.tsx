import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schicht, Kategorie, Veranstaltung } from '../types'
import { getBanner } from '../eventBanner'

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function Marktplatz({ profile }: Props) {
  const [schichten,       setSchichten]       = useState<Schicht[]>([])
  const [kategorien,      setKategorien]      = useState<Kategorie[]>([])
  const [veranstaltungen, setVeranstaltungen] = useState<Veranstaltung[]>([])
  const [myBookings,      setMyBookings]      = useState<number[]>([])
  const [filter,          setFilter]          = useState<string | null>(null)
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState<Schicht | null>(null)
  const [teilnehmer,      setTeilnehmer]      = useState<{ name: string }[]>([])
  const [teilnehmerLoading, setTeilnehmerLoading] = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [showDanke,       setShowDanke]       = useState(false)
  const [dankeShift,      setDankeShift]      = useState<Schicht | null>(null)
  const [expandedEvents,  setExpandedEvents]  = useState<Set<string>>(new Set())
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: sh }, { data: bk }, { data: kat }, { data: ev }] = await Promise.all([
      supabase.from('schichten').select('*, veranstaltungen(name), kategorien(name)').order('startzeit'),
      supabase.from('schichtbelegungen').select('schicht_id').eq('mitglied_id', profile.id).neq('status', 'abgesagt'),
      supabase.from('kategorien').select('*').order('name'),
      supabase.from('veranstaltungen').select('id, name, datum, datum_ende, ort, status, kategorie'),
    ])
    setSchichten(sh ?? [])
    setMyBookings((bk ?? []).map((b: any) => b.schicht_id))
    setKategorien(kat ?? [])
    setVeranstaltungen(ev ?? [])
  }

  function toggleEvent(evId: string) {
    setExpandedEvents(prev => {
      const next = new Set(prev)
      if (next.has(evId)) next.delete(evId)
      else next.add(evId)
      return next
    })
  }

  async function openDetail(s: Schicht) {
    setSelected(s)
    setTeilnehmer([])
    setTeilnehmerLoading(true)
    const { data } = await supabase.from('schichtbelegungen').select('profiles(name, display_name)').eq('schicht_id', s.id).neq('status', 'abgesagt')
    setTeilnehmer((data ?? []).map((b: any) => ({ name: b.profiles?.display_name || b.profiles?.name || 'Unbekannt' })))
    setTeilnehmerLoading(false)
  }

  async function joinShift(s: Schicht) {
    setSaving(true)
    const { data: existing } = await supabase.from('schichtbelegungen').select('id').eq('schicht_id', s.id).eq('mitglied_id', profile.id).single()
    if (existing) {
      await supabase.from('schichtbelegungen').update({ status: 'Angemeldet' }).eq('id', existing.id)
    } else {
      await supabase.from('schichtbelegungen').insert({ schicht_id: s.id, mitglied_id: profile.id, status: 'Angemeldet' })
    }
    await supabase.from('schichten').update({ belegt: s.belegt + 1 }).eq('id', s.id)
    await loadData()
    setSaving(false); setSelected(null); setDankeShift(s); setShowDanke(true); startKonfetti()
  }

  async function leaveShift(s: Schicht) {
    setSaving(true)
    await supabase.from('schichtbelegungen').update({ status: 'abgesagt' }).eq('schicht_id', s.id).eq('mitglied_id', profile.id)
    await supabase.from('schichten').update({ belegt: Math.max(0, s.belegt - 1) }).eq('id', s.id)
    await loadData(); setSaving(false); setSelected(null)
  }

  function closeDanke() { setShowDanke(false); stopKonfetti() }

  const FARBEN = ['#61de8a','#86efac','#fff','#fde68a','#f87171','#60a5fa']

  function startKonfetti() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.display = 'block'; canvas.width = window.innerWidth; canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')!
    const parts = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
      w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
      farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)],
      rot: Math.random() * 360, rotSpeed: (Math.random() - .5) * 8,
      vx: (Math.random() - .5) * 4, vy: Math.random() * 4 + 2, opacity: 1,
    }))
    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height); let alive = false
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed
        if (p.y > canvas!.height * .7) p.opacity -= .02
        if (p.opacity > 0) alive = true
        ctx.save(); ctx.globalAlpha = Math.max(0, p.opacity); ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180)
        ctx.fillStyle = p.farbe; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h); ctx.restore()
      })
      if (alive) animRef.current = requestAnimationFrame(draw); else canvas!.style.display = 'none'
    }
    draw()
  }

  function stopKonfetti() {
    cancelAnimationFrame(animRef.current)
    const canvas = canvasRef.current
    if (canvas) { canvas.style.display = 'none'; canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height) }
  }

  const isMine = (s: Schicht) => myBookings.includes(s.id)
  const isFull = (s: Schicht) => s.belegt >= s.plaetze

  const aktiveEventIds = veranstaltungen.filter(v => v.status !== 'Abgeschlossen').map(v => v.id)
  const filtered = schichten
    .filter(s => aktiveEventIds.includes(s.veranstaltung_id))
    .filter(s => filter === null || s.kategorie_id === filter)
    .filter(s => !search || s.bezeichnung.toLowerCase().includes(search.toLowerCase()))

  const grouped = filtered.reduce((acc, s) => {
    const key = s.veranstaltung_id
    if (!acc[key]) acc[key] = { name: s.veranstaltungen?.name ?? 'Unbekannt', shifts: [] }
    acc[key].shifts.push(s)
    return acc
  }, {} as Record<number, { name: string; shifts: Schicht[] }>)

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
      <canvas ref={canvasRef} style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:999, display:'none' }} />

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22, color:'#e5e2e1' }}>Schicht-Marktplatz</h1>
        <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13, marginTop:2 }}>Sichere dir deinen Platz beim nächsten Event.</p>
      </div>

      <div style={{ position:'relative' }}>
        <span className="material-symbols-outlined" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'rgba(229,226,225,0.3)' }}>search</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Schicht suchen..."
          style={{ width:'100%', padding:'10px 14px 10px 38px', border:'1.5px solid rgba(255,255,255,0.08)', borderRadius:99, fontSize:13, fontFamily:'Manrope,sans-serif', outline:'none', background:'#1c1b1b', color:'#e5e2e1' }} />
      </div>

      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
        <button onClick={() => setFilter(null)}
          style={{ padding:'7px 16px', borderRadius:99, border:'none', background: filter === null ? '#61de8a' : '#2a2a2a', color: filter === null ? '#00391a' : 'rgba(229,226,225,0.5)', fontSize:11, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'Lexend,sans-serif', flexShrink:0 }}>
          Alle
        </button>
        {kategorien.map(k => (
          <button key={k.id} onClick={() => setFilter(filter === k.id ? null : k.id)}
            style={{ padding:'7px 16px', borderRadius:99, border:'none', background: filter === k.id ? '#61de8a' : '#2a2a2a', color: filter === k.id ? '#00391a' : 'rgba(229,226,225,0.5)', fontSize:11, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'Lexend,sans-serif', flexShrink:0 }}>
            {k.name}
          </button>
        ))}
      </div>

      {Object.entries(grouped).map(([evId, gruppe]) => {
        const ev = veranstaltungen.find(v => v.id === Number(evId))
        const banner = getBanner(ev?.kategorie as any)
        const isExpanded = expandedEvents.has(evId)
        const meineSchichtenCount = gruppe.shifts.filter(s => isMine(s)).length
        const freieSchichtenCount = gruppe.shifts.filter(s => !isFull(s)).length

        return (
          <div key={evId} style={{ background:'#1c1b1b', borderRadius:20, overflow:'hidden', border:'1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ height:90, background: banner.gradient, position:'relative', display:'flex', alignItems:'flex-end', padding:'12px 16px', cursor:'pointer', borderBottom:'1px solid rgba(97,222,138,0.1)' }}
              onClick={() => toggleEvent(evId)}>
              <div style={{ flex:1 }}>
                <span style={{ background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:9, fontWeight:900, padding:'2px 8px', borderRadius:4, textTransform:'uppercase', letterSpacing:'.06em', backdropFilter:'blur(4px)' }}>
                  {banner.label}
                </span>
                <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:16, color:'#fff', marginTop:4 }}>{gruppe.name}</h2>
                {ev?.datum && (
                  <p style={{ fontSize:11, color:'rgba(255,255,255,.7)', marginTop:3, fontWeight:600 }}>
                    📅 {new Date(ev.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}
                    {ev.datum_ende && ev.datum_ende !== ev.datum && <> – {new Date(ev.datum_ende).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}</>}
                  </p>
                )}
              </div>
              <span style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontSize:52, opacity:.15, lineHeight:1 }}>{banner.icon}</span>
            </div>

            <button onClick={() => toggleEvent(evId)}
              style={{ width:'100%', padding:'12px 16px', border:'none', background: isExpanded ? '#2a2a2a' : 'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom: isExpanded ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className="material-symbols-outlined" style={{ fontSize:20, color:'#61de8a' }}>event_note</span>
                <div style={{ textAlign:'left' }}>
                  <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'#e5e2e1' }}>
                    {gruppe.shifts.length} Schicht{gruppe.shifts.length !== 1 ? 'en' : ''} anzeigen
                  </p>
                  <p style={{ fontSize:11, color:'rgba(229,226,225,0.4)', marginTop:1 }}>
                    {freieSchichtenCount} frei
                    {meineSchichtenCount > 0 && <span style={{ marginLeft:6, color:'#61de8a', fontWeight:700 }}>· {meineSchichtenCount} angemeldet</span>}
                  </p>
                </div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize:24, color:'#61de8a', transition:'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
            </button>

            {isExpanded && (
              <div style={{ padding:'8px 12px 12px', display:'flex', flexDirection:'column', gap:8 }}>
                {gruppe.shifts.map(s => (
                  <ShiftItem key={s.id} shift={s} isMine={isMine(s)} isFull={isFull(s)} onClick={() => openDetail(s)} />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {Object.keys(grouped).length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:'rgba(229,226,225,0.3)' }}>
          <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8 }}>search_off</span>
          Keine Schichten gefunden
        </div>
      )}

      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={() => setSelected(null)}>
          <div style={{ background:'#1c1b1b', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', border:'1px solid rgba(255,255,255,0.08)', borderBottom:'none' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'rgba(255,255,255,0.2)', borderRadius:2, margin:'0 auto 16px' }} />
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:18, marginBottom:8, color:'#e5e2e1' }}>{selected.bezeichnung}</h2>
            <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
              <span style={{ background:'rgba(97,222,138,0.1)', color:'#61de8a', fontSize:10, fontWeight:900, padding:'3px 10px', borderRadius:99, fontFamily:'Lexend,sans-serif', border:'1px solid rgba(97,222,138,0.2)' }}>+{selected.punkte} Pkt</span>
              <span style={{ background:'rgba(255,255,255,0.06)', color:'rgba(229,226,225,0.6)', fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:99 }}>{selected.veranstaltungen?.name}</span>
              {(selected as any).kategorien?.name && (
                <span style={{ background:'rgba(97,222,138,0.1)', color:'#61de8a', fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:99 }}>{(selected as any).kategorien.name}</span>
              )}
            </div>
            <InfoRow label="Uhrzeit" value={`${selected.startzeit?.slice(0,5)} – ${selected.endzeit?.slice(0,5)} Uhr`} />
            <InfoRow label="Aufgabe" value={selected.beschreibung ?? '–'} />
            <InfoRow label="Belegung" value={`${selected.belegt} von ${selected.plaetze} Plätzen besetzt`} />
            <BelegungsAnzeige belegt={selected.belegt} gesamt={selected.plaetze} />
            {selected.belegt > 0 && (
              <div style={{ marginTop:16 }}>
                <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.4)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Bereits dabei</p>
                {teilnehmerLoading ? <p style={{ fontSize:12, color:'rgba(229,226,225,0.4)' }}>Wird geladen...</p>
                  : teilnehmer.map((t, i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#2a2a2a', borderRadius:10, marginBottom:6 }}>
                      <div style={{ width:30, height:30, borderRadius:'50%', background:'#27500a', border:'1.5px solid #61de8a', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, color:'#61de8a' }}>{t.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</span>
                      </div>
                      <span style={{ fontFamily:'Manrope,sans-serif', fontWeight:600, fontSize:13, color:'#e5e2e1' }}>{t.name}</span>
                      {t.name === profile.name && <span style={{ marginLeft:'auto', fontSize:9, fontWeight:900, background:'rgba(97,222,138,0.1)', color:'#61de8a', padding:'2px 7px', borderRadius:99 }}>Du</span>}
                    </div>
                  ))}
              </div>
            )}
            <div style={{ height:16 }} />
            {isMine(selected)
              ? <button style={{ width:'100%', padding:14, background:'rgba(239,68,68,0.1)', color:'#ef4444', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' }}
                  onClick={() => leaveShift(selected)} disabled={saving}>Schicht abmelden</button>
              : isFull(selected)
                ? <button disabled style={{ width:'100%', padding:14, background:'rgba(255,255,255,0.05)', color:'rgba(229,226,225,0.3)', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'not-allowed' }}>Schicht ist voll</button>
                : <button style={{ width:'100%', padding:14, background:'#61de8a', color:'#00391a', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' }}
                    onClick={() => joinShift(selected)} disabled={saving}>Ich bin dabei! (+{selected.punkte} Punkte)</button>
            }
          </div>
        </div>
      )}

      {showDanke && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:998, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#1c1b1b', borderRadius:24, padding:32, textAlign:'center', maxWidth:300, width:'90%', border:'1px solid rgba(97,222,138,0.2)' }}>
            <div style={{ fontSize:52, marginBottom:8 }}>🎉</div>
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontSize:22, fontWeight:900, color:'#61de8a', marginBottom:6 }}>Danke dir!</h2>
            <p style={{ fontSize:14, color:'rgba(229,226,225,0.6)', lineHeight:1.5, marginBottom:16 }}>
              Du hast <strong style={{ color:'#e5e2e1' }}>{dankeShift?.bezeichnung}</strong> übernommen.
            </p>
            <div style={{ background:'rgba(97,222,138,0.08)', borderRadius:12, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#61de8a', fontWeight:700, border:'1px solid rgba(97,222,138,0.15)' }}>
              +{dankeShift?.punkte} Punkte werden nach der Schicht gutgeschrieben
            </div>
            <button onClick={closeDanke} style={{ width:'100%', background:'#61de8a', color:'#00391a', fontFamily:'Lexend,sans-serif', fontWeight:900, padding:14, borderRadius:12, border:'none', fontSize:14, cursor:'pointer' }}>
              Super, bin dabei! ✓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShiftItem({ shift, isMine, isFull, onClick }: { shift: Schicht; isMine: boolean; isFull: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ background:'#2a2a2a', borderRadius:14, padding:'12px 14px', cursor:'pointer', border: isMine ? '1.5px solid rgba(97,222,138,0.4)' : '1px solid rgba(255,255,255,0.04)', position:'relative', overflow:'hidden' }}>
      {isMine && <div style={{ position:'absolute', left:0, top:0, bottom:0, width:3, background:'#61de8a', borderRadius:'99px 0 0 99px' }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div>
          <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#e5e2e1' }}>{shift.bezeichnung}</h3>
          <span style={{ fontSize:11, color:'rgba(229,226,225,0.4)', display:'flex', alignItems:'center', gap:6, marginTop:3, flexWrap:'wrap' }}>
            <span style={{ display:'flex', alignItems:'center', gap:3 }}>
              <span className="material-symbols-outlined" style={{ fontSize:13 }}>schedule</span>
              {shift.startzeit?.slice(0,5)} – {shift.endzeit?.slice(0,5)}
            </span>
            {(shift as any).kategorien?.name && (
              <span style={{ background:'rgba(97,222,138,0.1)', color:'#61de8a', fontSize:10, fontWeight:700, padding:'1px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>
                {(shift as any).kategorien.name}
              </span>
            )}
          </span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <span style={{ background:'rgba(97,222,138,0.1)', color:'#61de8a', fontSize:10, fontWeight:900, padding:'2px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>{shift.punkte} Pkt</span>
          {isMine && <span style={{ background:'rgba(97,222,138,0.15)', color:'#61de8a', fontSize:9, fontWeight:900, padding:'2px 8px', borderRadius:99 }}>✓ Dabei</span>}
        </div>
      </div>
      <BelegungsAnzeige belegt={shift.belegt} gesamt={shift.plaetze} />
    </div>
  )
}

function BelegungsAnzeige({ belegt, gesamt }: { belegt: number; gesamt: number }) {
  const voll = belegt >= gesamt
  const halb = !voll && belegt / gesamt >= 0.6
  const farbe = voll ? '#ef4444' : halb ? '#f59e0b' : '#61de8a'
  const bg = voll ? 'rgba(239,68,68,0.08)' : halb ? 'rgba(245,158,11,0.08)' : 'rgba(97,222,138,0.08)'
  const frei = gesamt - belegt
  return (
    <div style={{ background:bg, borderRadius:8, padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
        {Array.from({ length: gesamt }, (_, i) => (
          <span key={i} className="material-symbols-outlined" style={{ fontSize:16, color: i < belegt ? farbe : 'rgba(255,255,255,0.15)', fontVariationSettings: `'FILL' ${i < belegt ? 1 : 0}` }}>person</span>
        ))}
      </div>
      <span style={{ fontSize:11, fontWeight:900, color:farbe, fontFamily:'Lexend,sans-serif' }}>
        {voll ? '🔴 Voll besetzt' : `${belegt}/${gesamt} · ${frei} frei`}
      </span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.06)', fontSize:13 }}>
      <span style={{ color:'rgba(229,226,225,0.4)' }}>{label}</span>
      <span style={{ fontWeight:600, maxWidth:'60%', textAlign:'right', color:'#e5e2e1' }}>{value}</span>
    </div>
  )
}
