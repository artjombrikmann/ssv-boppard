import { useEffect, useState, useRef } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schicht, Kategorie, Veranstaltung } from '../types'
import { getBanner } from '../eventBanner' // NEU

interface Props { profile: Profile; onTabChange: (tab: string) => void }

export default function Marktplatz({ profile }: Props) {
  const [schichten,    setSchichten]    = useState<Schicht[]>([])
  const [kategorien,   setKategorien]   = useState<Kategorie[]>([])
  const [veranstaltungen, setVeranstaltungen] = useState<Veranstaltung[]>([]) // NEU
  const [myBookings,   setMyBookings]   = useState<number[]>([])
  const [filter,       setFilter]       = useState<number | null>(null)
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Schicht | null>(null)
  const [teilnehmer,   setTeilnehmer]   = useState<{ name: string }[]>([])
  const [teilnehmerLoading, setTeilnehmerLoading] = useState(false)  
  const [saving,       setSaving]       = useState(false)
  const [showDanke,    setShowDanke]    = useState(false)
  const [dankeShift,   setDankeShift]   = useState<Schicht | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef   = useRef<number>(0)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: sh }, { data: bk }, { data: kat }, { data: ev }] = await Promise.all([
      supabase.from('schichten').select('*, veranstaltungen(name,typ), kategorien(name)').order('startzeit'),
      supabase.from('schichtbelegungen').select('schicht_id').eq('mitglied_id', profile.id),
      supabase.from('kategorien').select('*').order('name'),
      supabase.from('veranstaltungen').select('*'), // NEU
    ])
    setSchichten(sh ?? [])
    setMyBookings((bk ?? []).map((b: any) => b.schicht_id))
    setKategorien(kat ?? [])
    setVeranstaltungen(ev ?? []) // NEU
  }

  async function openDetail(s: Schicht) {
    setSelected(s)
    setTeilnehmer([])
    setTeilnehmerLoading(true)
    const { data } = await supabase
      .from('schichtbelegungen')
      .select('profiles(name, display_name)')
      .eq('schicht_id', s.id)
    setTeilnehmer((data ?? []).map((b: any) => ({ name: b.profiles?.display_name || b.profiles?.name || 'Unbekannt' })))
    setTeilnehmerLoading(false)
  }

  async function joinShift(s: Schicht) {
    setSaving(true)
    await supabase.from('schichtbelegungen').insert({ schicht_id: s.id, mitglied_id: profile.id, status: 'Angemeldet' })
    await supabase.from('schichten').update({ belegt: s.belegt + 1 }).eq('id', s.id)
    await loadData()
    setSaving(false)
    setSelected(null)
    setDankeShift(s)
    setShowDanke(true)
    startKonfetti()
  }

  async function leaveShift(s: Schicht) {
    setSaving(true)
    await supabase.from('schichtbelegungen').delete().eq('schicht_id', s.id).eq('mitglied_id', profile.id)
    await supabase.from('schichten').update({ belegt: Math.max(0, s.belegt - 1) }).eq('id', s.id)
    await loadData()
    setSaving(false)
    setSelected(null)
  }

  function closeDanke() { setShowDanke(false); stopKonfetti() }

  const FARBEN = ['#0d631b','#86efac','#fff','#fde68a','#f87171','#60a5fa']
  function startKonfetti() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.display = 'block'
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    const ctx = canvas.getContext('2d')!
    const parts = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
      w: Math.random() * 10 + 5, h: Math.random() * 6 + 3,
      farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)],
      rot: Math.random() * 360, rotSpeed: (Math.random() - .5) * 8,
      vx: (Math.random() - .5) * 4, vy: Math.random() * 4 + 2, opacity: 1,
    }))
    function draw() {
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      let alive = false
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rotSpeed
        if (p.y > canvas!.height * .7) p.opacity -= .02
        if (p.opacity > 0) alive = true
        ctx.save(); ctx.globalAlpha = Math.max(0, p.opacity)
        ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180)
        ctx.fillStyle = p.farbe; ctx.fillRect(-p.w/2, -p.h/2, p.w, p.h)
        ctx.restore()
      })
      if (alive) animRef.current = requestAnimationFrame(draw)
      else canvas!.style.display = 'none'
    }
    draw()
  }
  function stopKonfetti() {
    cancelAnimationFrame(animRef.current)
    const canvas = canvasRef.current
    if (canvas) { canvas.style.display = 'none'; canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height) }
  }

  const isMine = (s: Schicht) => myBookings.includes(s.id)
  const isFull = (s: Schicht) => s.belegt >= s.plaetze

  const filtered = schichten
    .filter(s => filter === null || s.kategorie_id === filter)
    .filter(s => !search || s.bezeichnung.toLowerCase().includes(search.toLowerCase()))

  const grouped = filtered.reduce((acc, s) => {
    const key = s.veranstaltung_id
    if (!acc[key]) acc[key] = { name: s.veranstaltungen?.name ?? 'Unbekannt', typ: s.veranstaltungen?.typ ?? '', shifts: [] }
    acc[key].shifts.push(s)
    return acc
  }, {} as Record<number, { name: string; typ: string; shifts: Schicht[] }>)

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
      <canvas ref={canvasRef} style={{ position:'fixed', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none', zIndex:999, display:'none' }} />

      <div>
        <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Schicht-Marktplatz</h1>
        <p style={{ color:'#5d5e61', fontSize:13, marginTop:2 }}>Sichere dir deinen Platz beim nächsten Event.</p>
      </div>

      {/* Suche */}
      <div style={{ position:'relative' }}>
        <span className="material-symbols-outlined" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:18, color:'#9ca3af' }}>search</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Schicht suchen..."
          style={{ width:'100%', padding:'10px 14px 10px 38px', border:'1.5px solid #e5e7eb', borderRadius:99, fontSize:13, fontFamily:'Manrope,sans-serif', outline:'none', background:'#fff' }} />
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
        <button onClick={() => setFilter(null)}
          style={{ padding:'7px 16px', borderRadius:99, border:'none', background: filter === null ? '#0d631b' : '#eceeec', color: filter === null ? '#fff' : '#5d5e61', fontSize:11, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'Lexend,sans-serif', flexShrink:0 }}>
          Alle
        </button>
        {kategorien.map(k => (
          <button key={k.id} onClick={() => setFilter(k.id)}
            style={{ padding:'7px 16px', borderRadius:99, border:'none', background: filter === k.id ? '#0d631b' : '#eceeec', color: filter === k.id ? '#fff' : '#5d5e61', fontSize:11, fontWeight:900, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'Lexend,sans-serif', flexShrink:0 }}>
            {k.name}
          </button>
        ))}
      </div>

      {/* Schichten nach Veranstaltung */}
      {Object.entries(grouped).map(([evId, gruppe]) => {
        // NEU – Banner anhand der Veranstaltungs-Kategorie bestimmen
        const ev = veranstaltungen.find(v => v.id === Number(evId))
        const banner = getBanner(ev?.kategorie as any)

        return (
          <div key={evId} style={{ background:'#fff', borderRadius:24, overflow:'hidden', border:'1px solid #f3f4f6' }}>
            {/* NEU – dynamischer Banner */}
            <div style={{
              height: 90,
              background: banner.gradient,
              position: 'relative',
              display: 'flex',
              alignItems: 'flex-end',
              padding: '12px 16px',
            }}>
              <div>
                <span style={{ background:'rgba(255,255,255,.2)', color:'#fff', fontSize:9, fontWeight:900, padding:'2px 8px', borderRadius:4, textTransform:'uppercase', letterSpacing:'.06em' }}>
                  {banner.label}
                </span>
                <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:16, color:'#fff', marginTop:4 }}>
                  {gruppe.name}
                </h2>
                {ev?.datum && (
                  <p style={{ fontSize:11, color:'rgba(255,255,255,.8)', marginTop:3, fontWeight:600 }}>
                    📅 {new Date(ev.datum).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}
                    {ev.datum_ende && ev.datum_ende !== ev.datum && (
                      <> – {new Date(ev.datum_ende).toLocaleDateString('de-DE', { weekday:'short', day:'2-digit', month:'2-digit', year:'numeric' })}</>
                    )}
                  </p>
                )}
              </div>
              {/* Großes Kategorie-Icon als dekorativer Hintergrund */}
              <span style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', fontSize:52, opacity:.25, lineHeight:1 }}>
                {banner.icon}
              </span>
            </div>

            <div style={{ padding:'12px', display:'flex', flexDirection:'column', gap:8 }}>
              {gruppe.shifts.map(s => (
                <ShiftItem key={s.id} shift={s} isMine={isMine(s)} isFull={isFull(s)} onClick={() => openDetail(s)} />
              ))}
            </div>
          </div>
        )
      })}

      {Object.keys(grouped).length === 0 && (
        <div style={{ textAlign:'center', padding:'40px 0', color:'#9ca3af' }}>
          <span className="material-symbols-outlined" style={{ fontSize:40, display:'block', marginBottom:8 }}>search_off</span>
          Keine Schichten gefunden
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setSelected(null)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', padding:20, width:'100%', maxWidth:420, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width:40, height:4, background:'#e5e7eb', borderRadius:2, margin:'0 auto 16px' }} />
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:18, marginBottom:8 }}>{selected.bezeichnung}</h2>
            <div style={{ display:'flex', gap:6, marginBottom:16 }}>
              <span style={{ background:'#e8f5ee', color:'#0d631b', fontSize:10, fontWeight:900, padding:'3px 10px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>+{selected.punkte} Pkt</span>
              <span style={{ background:'#f3f4f6', color:'#5d5e61', fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:99 }}>{selected.veranstaltungen?.name}</span>
            </div>
            <InfoRow label="Uhrzeit"  value={`${selected.startzeit?.slice(0,5)} – ${selected.endzeit?.slice(0,5)} Uhr`} />
            <InfoRow label="Aufgabe"  value={selected.beschreibung ?? '–'} />
            <InfoRow label="Belegung" value={`${selected.belegt} von ${selected.plaetze} Plätzen besetzt`} />
            <BelegungsAnzeige belegt={selected.belegt} gesamt={selected.plaetze} />

            {selected.belegt > 0 && (
              <div style={{ marginTop:16 }}>
                <p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>
                  Bereits dabei
                </p>
                {teilnehmerLoading
                  ? <p style={{ fontSize:12, color:'#9ca3af' }}>Wird geladen...</p>
                  : teilnehmer.length === 0
                    ? <p style={{ fontSize:12, color:'#9ca3af' }}>Keine Teilnehmer gefunden.</p>
                    : (
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                      {teilnehmer.map((t, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#f8faf8', borderRadius:10 }}>
                          <div style={{ width:30, height:30, borderRadius:'50%', background:'#e8f5ee', border:'1.5px solid #0d631b', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, color:'#0d631b' }}>
                              {t.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                            </span>
                          </div>
                          <span style={{ fontFamily:'Manrope,sans-serif', fontWeight:600, fontSize:13 }}>{t.name}</span>
                          {t.name === profile.name && (
                            <span style={{ marginLeft:'auto', fontSize:9, fontWeight:900, background:'#dcfce7', color:'#16a34a', padding:'2px 7px', borderRadius:99 }}>Du</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                }
              </div>
            )}

            <div style={{ height:16 }} />
            {isMine(selected)
              ? <button style={{ width:'100%', padding:14, background:'#fef2f2', color:'#ef4444', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' }}
                  onClick={() => leaveShift(selected)} disabled={saving}>Schicht abmelden</button>
              : isFull(selected)
                ? <button disabled style={{ width:'100%', padding:14, background:'#f3f4f6', color:'#9ca3af', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'not-allowed' }}>Schicht ist voll</button>
                : <button style={{ width:'100%', padding:14, background:'#0d631b', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' }}
                    onClick={() => joinShift(selected)} disabled={saving}>
                    Ich bin dabei! (+{selected.punkte} Punkte)
                  </button>
            }
          </div>
        </div>
      )}

      {/* Danke Overlay */}
      {showDanke && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:998, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ background:'#fff', borderRadius:24, padding:32, textAlign:'center', maxWidth:300, width:'90%' }}>
            <div style={{ fontSize:52, marginBottom:8 }}>🎉</div>
            <h2 style={{ fontFamily:'Lexend,sans-serif', fontSize:22, fontWeight:900, color:'#0d631b', marginBottom:6 }}>Danke dir!</h2>
            <p style={{ fontSize:14, color:'#5d5e61', lineHeight:1.5, marginBottom:16 }}>
              Du hast <strong>{dankeShift?.bezeichnung}</strong> übernommen.<br />Der SSV Boppard freut sich auf dich!
            </p>
            <div style={{ background:'#e8f5ee', borderRadius:12, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#0d631b', fontWeight:700 }}>
              +{dankeShift?.punkte} Punkte werden nach der Schicht gutgeschrieben
            </div>
            <button onClick={closeDanke}
              style={{ width:'100%', background:'#0d631b', color:'#fff', fontFamily:'Lexend,sans-serif', fontWeight:900, padding:14, borderRadius:12, border:'none', fontSize:14, cursor:'pointer' }}>
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
    <div onClick={onClick} style={{ background:'#f8faf8', borderRadius:14, padding:'12px 14px', cursor:'pointer', border: isMine ? '1.5px solid #0d631b' : '1px solid #f3f4f6' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div>
          <h3 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{shift.bezeichnung}</h3>
          <span style={{ fontSize:11, color:'#5d5e61', display:'flex', alignItems:'center', gap:3, marginTop:3 }}>
            <span className="material-symbols-outlined" style={{ fontSize:13 }}>schedule</span>
            {shift.startzeit?.slice(0,5)} – {shift.endzeit?.slice(0,5)}
          </span>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <span style={{ background:'#e8f5ee', color:'#0d631b', fontSize:10, fontWeight:900, padding:'2px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>{shift.punkte} Pkt</span>
          {isMine && <span style={{ background:'#dcfce7', color:'#16a34a', fontSize:9, fontWeight:900, padding:'2px 8px', borderRadius:99 }}>✓ Dabei</span>}
        </div>
      </div>
      <BelegungsAnzeige belegt={shift.belegt} gesamt={shift.plaetze} />
    </div>
  )
}

function BelegungsAnzeige({ belegt, gesamt }: { belegt: number; gesamt: number }) {
  const voll  = belegt >= gesamt
  const halb  = !voll && belegt / gesamt >= 0.6
  const bg    = voll ? '#fef2f2' : halb ? '#fffbeb' : '#e8f5ee'
  const farbe = voll ? '#ef4444' : halb ? '#b45309' : '#0d631b'
  const frei  = gesamt - belegt
  return (
    <div style={{ background:bg, borderRadius:8, padding:'6px 10px', display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
      <div style={{ display:'flex', gap:3, alignItems:'center' }}>
        {Array.from({ length: gesamt }, (_, i) => (
          <span key={i} className="material-symbols-outlined" style={{ fontSize:16, color: i < belegt ? farbe : '#d1d5db', fontVariationSettings: `'FILL' ${i < belegt ? 1 : 0}` }}>person</span>
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
    <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f9fafb', fontSize:13 }}>
      <span style={{ color:'#9ca3af' }}>{label}</span>
      <span style={{ fontWeight:600, maxWidth:'60%', textAlign:'right' }}>{value}</span>
    </div>
  )
}