import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schichtbelegung, Veranstaltung, Einstellungen, GutscheinAnfrage, Kategorie, Schicht } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }
type AdminTab = 'uebersicht' | 'veranstaltungen' | 'kategorien' | 'punkte' | 'einloesungen'

interface VeranstaltungMitAuslastung extends Veranstaltung {
  schichten: Schicht[]
  gesamtPlaetze: number
  belegtePlaetze: number
  auslastung: number
}

export default function Verwaltung(_: Props) {
  const [tab,        setTab]        = useState<AdminTab>('uebersicht')
  const [bookings,   setBookings]   = useState<Schichtbelegung[]>([])
  const [members,    setMembers]    = useState<Profile[]>([])
  const [events,     setEvents]     = useState<VeranstaltungMitAuslastung[]>([])
  const [rawEvents,  setRawEvents]  = useState<Veranstaltung[]>([])
  const [reqs,       setReqs]       = useState<GutscheinAnfrage[]>([])
  const [kategorien, setKategorien] = useState<Kategorie[]>([])
  const [settings,   setSettings]   = useState<Einstellungen>({ id:1, punkte_kurz:5, punkte_normal:10, punkte_lang:15, punkte_sonder:20, bonus_turnier:3, bonus_fest:2, admin_email:'geschaeftsfuehrung@ssv-boppard.de' })
  // NEU: kategorie im newEv State
  const [newEv, setNewEv] = useState({ name:'', datum:'', datum_ende:'', ort:'', kategorie:'heimspiel' })
  const [newSh,      setNewSh]      = useState({ bezeichnung:'', veranstaltung_id:0, kategorie_id:'', startzeit:'09:00', endzeit:'13:00', plaetze:3, punkte:10, beschreibung:'' })
  const [newKat,     setNewKat]     = useState('')
  const [saved,      setSaved]      = useState(false)
  const [toast,      setToast]      = useState('')
  const [expandedEv, setExpandedEv] = useState<number | null>(null)

  useEffect(() => { loadAll() }, [])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function loadAll() {
    const [b, m, e, s_data, r, s, k] = await Promise.all([
      supabase.from('schichtbelegungen').select('*, profiles(name), schichten(bezeichnung,punkte)'),
      supabase.from('profiles').select('*').order('punkte', { ascending: false }),
      supabase.from('veranstaltungen').select('*').order('datum'),
      supabase.from('schichten').select('*'),
      supabase.from('gutschein_anfragen').select('*, profiles(name)').order('created_at', { ascending: false }),
      supabase.from('einstellungen').select('*').single(),
      supabase.from('kategorien').select('*').order('name'),
    ])

    const alleSchichten: Schicht[] = s_data.data ?? []
    const alleEvents: Veranstaltung[] = e.data ?? []
    setRawEvents(alleEvents)

    const evMitAuslastung: VeranstaltungMitAuslastung[] = alleEvents.map(ev => {
      const schichten = alleSchichten.filter(s => s.veranstaltung_id === ev.id)
      const gesamtPlaetze = schichten.reduce((sum, s) => sum + s.plaetze, 0)
      const belegtePlaetze = schichten.reduce((sum, s) => sum + s.belegt, 0)
      const auslastung = gesamtPlaetze > 0 ? Math.round((belegtePlaetze / gesamtPlaetze) * 100) : 0
      return { ...ev, schichten, gesamtPlaetze, belegtePlaetze, auslastung }
    })

    setBookings(b.data ?? [])
    setMembers(m.data ?? [])
    setEvents(evMitAuslastung)
    setReqs(r.data ?? [])
    if (s.data) setSettings(s.data)
    setKategorien(k.data ?? [])
  }

  async function givePoints(b: Schichtbelegung) {
    await supabase.from('schichtbelegungen').update({ punkte_vergeben: true }).eq('id', b.id)
    await supabase.rpc('add_punkte', { user_id: b.mitglied_id, amount: b.schichten?.punkte ?? 0 })
    showToast(`⭐ ${b.schichten?.punkte} Punkte vergeben!`)
    loadAll()
  }

  async function addEvent() {
    if (!newEv.name || !newEv.datum) { showToast('❌ Bitte Name und Datum eingeben'); return }
    await supabase.from('veranstaltungen').insert({ ...newEv, status: 'Geplant' })
    setNewEv({ name:'', typ:'Fußball-Turnier', datum:'', ort:'', kategorie:'heimspiel' })
    showToast('✅ Veranstaltung angelegt!')
    loadAll()
  }

  async function addShift() {
    if (!newSh.bezeichnung || !newSh.veranstaltung_id) { showToast('❌ Bezeichnung und Veranstaltung pflicht'); return }
    await supabase.from('schichten').insert({ ...newSh, belegt: 0 })
    setNewSh({ bezeichnung:'', veranstaltung_id:0, kategorie_id:'', startzeit:'09:00', endzeit:'13:00', plaetze:3, punkte:10, beschreibung:'' })
    showToast('✅ Schicht angelegt!')
    loadAll()
  }

  async function addKategorie() {
    if (!newKat.trim()) { showToast('❌ Bitte Namen eingeben'); return }
    if (kategorien.find(k => k.name.toLowerCase() === newKat.toLowerCase())) { showToast('❌ Kategorie existiert bereits'); return }
    await supabase.from('kategorien').insert({ name: newKat.trim() })
    setNewKat('')
    showToast(`✅ Kategorie "${newKat}" hinzugefügt!`)
    loadAll()
  }

  async function deleteKategorie(k: Kategorie) {
    if ((k.schichten_count ?? 0) > 0) { showToast('❌ Kategorie hat noch Schichten'); return }
    await supabase.from('kategorien').delete().eq('id', k.id)
    showToast('🗑️ Kategorie gelöscht')
    loadAll()
  }

  // NEU – Veranstaltung löschen
  async function deleteVeranstaltung(ev: VeranstaltungMitAuslastung) {
    const ok = window.confirm(
      `Veranstaltung "${ev.name}" wirklich löschen?\n\nAlle ${ev.schichten.length} Schichten und Belegungen werden ebenfalls gelöscht.`
    )
    if (!ok) return
    const { error } = await supabase.from('veranstaltungen').delete().eq('id', ev.id)
    if (error) showToast('❌ Fehler: ' + error.message)
    else { showToast('🗑️ Veranstaltung gelöscht'); loadAll() }
  }

  // NEU – Schicht löschen
  async function deleteSchicht(s: Schicht) {
    const belegtHinweis = s.belegt > 0 ? `\n\n⚠️ ${s.belegt} Mitglied(er) sind noch eingetragen und werden abgemeldet.` : ''
    const ok = window.confirm(`Schicht "${s.bezeichnung}" wirklich löschen?${belegtHinweis}`)
    if (!ok) return
    const { error } = await supabase.from('schichten').delete().eq('id', s.id)
    if (error) showToast('❌ Fehler: ' + error.message)
    else { showToast('🗑️ Schicht gelöscht'); loadAll() }
  }

  async function saveSettings() {
    await supabase.from('einstellungen').upsert({ id: 1, ...settings })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    showToast('✅ Einstellungen gespeichert!')
  }

  async function handleReq(id: number, status: string) {
    await supabase.from('gutschein_anfragen').update({ status }).eq('id', id)
    showToast(status === 'genehmigt' ? '✅ Genehmigt!' : '❌ Abgelehnt')
    loadAll()
  }

  function auslastungFarbe(pct: number) {
    if (pct >= 80) return '#0d631b'
    if (pct >= 50) return '#f59e0b'
    return '#ef4444'
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id:'uebersicht',      label:'Übersicht' },
    { id:'veranstaltungen', label:'Events' },
    { id:'kategorien',      label:'Kategorien' },
    { id:'punkte',          label:'Punkte' },
    { id:'einloesungen',    label:'Einlösungen' },
  ]

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>

      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, fontWeight:600, zIndex:500, whiteSpace:'nowrap', fontFamily:'Manrope,sans-serif' }}>
          {toast}
        </div>
      )}

      <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Admin-Bereich</h1>

      {/* Tabs */}
      <div style={{ display:'flex', gap:1, background:'#eceeec', borderRadius:14, padding:4, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:'8px 4px', borderRadius:10, border:'none', background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0d631b' : '#5d5e61', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, cursor:'pointer', whiteSpace:'nowrap', boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ÜBERSICHT ── */}
      {tab === 'uebersicht' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <div style={{ background:'#0d631b', borderRadius:20, padding:20, color:'#fff' }}>
            <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', opacity:.7, marginBottom:12 }}>Vereins-Übersicht</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[
                { val: bookings.filter(b => !b.punkte_vergeben).length, label:'Ausstehend' },
                { val: members.length, label:'Mitglieder' },
                { val: events.length, label:'Events' },
              ].map(s => (
                <div key={s.label}>
                  <p style={{ fontFamily:'Lexend,sans-serif', fontSize:24, fontWeight:900 }}>{s.val}</p>
                  <p style={{ fontSize:9, fontWeight:800, opacity:.7, textTransform:'uppercase', letterSpacing:'.06em' }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Veranstaltungen mit Auslastung */}
          <Section title={`Veranstaltungen & Auslastung (${events.length})`}>
            {events.length === 0
              ? <Empty text="Noch keine Veranstaltungen angelegt." />
              : events.map(ev => (
                <div key={ev.id} style={{ borderBottom:'1px solid #f9fafb' }}>
                  <div style={{ padding:'12px 0' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                      <div style={{ cursor:'pointer', flex:1 }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                        <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{ev.name}</p>
                        <p style={{ fontSize:11, color:'#9ca3af' }}>
                          {new Date(ev.datum).toLocaleDateString('de-DE')} · {ev.ort}
                        </p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ textAlign:'right', cursor:'pointer' }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                          <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:18, color: auslastungFarbe(ev.auslastung) }}>
                            {ev.auslastung}%
                          </p>
                          <p style={{ fontSize:10, color:'#9ca3af' }}>{ev.belegtePlaetze}/{ev.gesamtPlaetze} Plätze</p>
                        </div>
                        {/* NEU – Löschen-Button Veranstaltung */}
                        <button onClick={() => deleteVeranstaltung(ev)}
                          style={{ width:32, height:32, borderRadius:8, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                        </button>
                      </div>
                    </div>

                    <div style={{ height:6, background:'#f3f4f6', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${ev.auslastung}%`, background: auslastungFarbe(ev.auslastung), borderRadius:99, transition:'width .4s ease' }} />
                    </div>
                    <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', cursor:'pointer' }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                      <span style={{ fontSize:10, color:'#9ca3af' }}>{ev.schichten.length} Schichten</span>
                      <span className="material-symbols-outlined" style={{ fontSize:14, color:'#9ca3af' }}>
                        {expandedEv === ev.id ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>

                  {/* Ausgeklappte Schichten */}
                  {expandedEv === ev.id && ev.schichten.length > 0 && (
                    <div style={{ paddingBottom:12, display:'flex', flexDirection:'column', gap:6 }}>
                      {ev.schichten.map(s => {
                        const pct = s.plaetze > 0 ? Math.round((s.belegt / s.plaetze) * 100) : 0
                        return (
                          <div key={s.id} style={{ background:'#f8faf8', borderRadius:10, padding:'10px 12px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:600, fontSize:12 }}>{s.bezeichnung}</p>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontSize:11, fontWeight:700, color: auslastungFarbe(pct) }}>{s.belegt}/{s.plaetze}</span>
                                {/* NEU – Löschen-Button Schicht */}
                                <button onClick={() => deleteSchicht(s)}
                                  style={{ width:24, height:24, borderRadius:6, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <span className="material-symbols-outlined" style={{ fontSize:13, color:'#ef4444' }}>delete</span>
                                </button>
                              </div>
                            </div>
                            <div style={{ height:4, background:'#e5e7eb', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background: auslastungFarbe(pct), borderRadius:99 }} />
                            </div>
                            <p style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>
                              {s.startzeit} – {s.endzeit} · {s.punkte} Pkt
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {expandedEv === ev.id && ev.schichten.length === 0 && (
                    <p style={{ fontSize:12, color:'#9ca3af', paddingBottom:12 }}>Noch keine Schichten für diese Veranstaltung.</p>
                  )}
                </div>
              ))
            }
          </Section>

          {/* Ausstehende Punkte */}
          <Section title="Ausstehende Punkte vergeben">
            {bookings.filter(b => !b.punkte_vergeben).length === 0
              ? <Empty text="Alle Punkte vergeben ✅" />
              : bookings.filter(b => !b.punkte_vergeben).map(b => (
                <Row key={b.id}
                  title={(b.profiles as any)?.name ?? '–'}
                  sub={b.schichten?.bezeichnung ?? '–'}
                  right={<button onClick={() => givePoints(b)} style={btnSm}>✓ {b.schichten?.punkte} Pkt</button>} />
              ))
            }
          </Section>

          {/* Mitglieder */}
          <Section title={`Mitglieder (${members.length})`}>
            {members.map((m, i) => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: i < 3 ? '#e8f5ee' : '#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, color: i < 3 ? '#0d631b' : '#9ca3af' }}>
                    {(m.display_name || m.name)?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                  </span>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13 }}>{m.display_name || m.name}</p>
                  <p style={{ fontSize:10, color:'#9ca3af' }}>{m.schichten_count ?? 0} Schichten · {m.email}</p>
                </div>
                <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, color:'#0d631b' }}>{m.punkte} P</span>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* ── VERANSTALTUNGEN ── */}
      {tab === 'veranstaltungen' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Lege hier neue Veranstaltungen an und füge ihnen Schichten hinzu." />

          {/* Neue Veranstaltung */}
          <Section title="Neue Veranstaltung anlegen">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <F label="Name"><input style={inp} value={newEv.name} onChange={e=>setNewEv({...newEv,name:e.target.value})} placeholder="z.B. Sommerfest 2025"/></F>
              {/* Kategorie / Banner Auswahl */}
              <F label="Kategorie / Banner">
                <select style={inp} value={newEv.kategorie} onChange={e=>setNewEv({...newEv,kategorie:e.target.value})}>
                  <option value="heimspiel">⚽ Heimspiel</option>
                  <option value="vereinsfest">🎉 Vereinsfest</option>
                  <option value="flag-football">🏈 Flag-Football</option>
                  <option value="turnier">🏆 Turnier</option>
                </select>
              </F>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <F label="Von"><input style={inp} type="date" value={newEv.datum} onChange={e=>setNewEv({...newEv,datum:e.target.value})}/></F>
                <F label="Bis (optional)"><input style={inp} type="date" value={newEv.datum_ende} onChange={e=>setNewEv({...newEv,datum_ende:e.target.value})}/></F>
              </div>
              <F label="Ort"><input style={inp} value={newEv.ort} onChange={e=>setNewEv({...newEv,ort:e.target.value})} placeholder="Boppard"/></F>
              <button style={btnPrimary} onClick={addEvent}>Veranstaltung anlegen</button>
            </div>
          </Section>

          {/* Neue Schicht */}
          <Section title="Neue Schicht anlegen">
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <F label="Bezeichnung"><input style={inp} value={newSh.bezeichnung} onChange={e=>setNewSh({...newSh,bezeichnung:e.target.value})} placeholder="Kasse – Vormittag"/></F>
              <F label="Veranstaltung">
                <select style={inp} value={newSh.veranstaltung_id} onChange={e=>setNewSh({...newSh,veranstaltung_id:parseInt(e.target.value)})}>
                  <option value={0}>– auswählen –</option>
                  {rawEvents.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </F>
              <F label="Kategorie">
                <select style={inp} value={newSh.kategorie_id} onChange={e=>setNewSh({...newSh,kategorie_id:e.target.value})}>
                  <option value="">– keine –</option>
                  {kategorien.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
              </F>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <F label="Von"><input style={inp} type="time" value={newSh.startzeit} onChange={e=>setNewSh({...newSh,startzeit:e.target.value})}/></F>
                <F label="Bis"><input style={inp} type="time" value={newSh.endzeit} onChange={e=>setNewSh({...newSh,endzeit:e.target.value})}/></F>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <F label="Plätze"><input style={inp} type="number" min="1" value={newSh.plaetze} onChange={e=>setNewSh({...newSh,plaetze:parseInt(e.target.value)||1})}/></F>
                <F label="Punkte"><input style={inp} type="number" min="1" value={newSh.punkte} onChange={e=>setNewSh({...newSh,punkte:parseInt(e.target.value)||1})}/></F>
              </div>
              <F label="Aufgabe"><input style={inp} value={newSh.beschreibung} onChange={e=>setNewSh({...newSh,beschreibung:e.target.value})} placeholder="Kurze Beschreibung"/></F>
              <button style={btnPrimary} onClick={addShift}>Schicht anlegen</button>
            </div>
          </Section>
        </div>
      )}

      {/* ── KATEGORIEN ── */}
      {tab === 'kategorien' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Diese Kategorien erscheinen als Filter im Schicht-Marktplatz. Jede Schicht wird einer Kategorie zugeordnet." />
          <Section title="Neue Kategorie">
            <div style={{ display:'flex', gap:8 }}>
              <input style={{ ...inp, flex:1 }} value={newKat} onChange={e=>setNewKat(e.target.value)} placeholder="z.B. Sicherheitsdienst"
                onKeyDown={e => e.key === 'Enter' && addKategorie()} />
              <button onClick={addKategorie} style={{ ...btnPrimary, width:'auto', padding:'10px 16px', flexShrink:0 }}>
                <span className="material-symbols-outlined" style={{ fontSize:18 }}>add</span>
              </button>
            </div>
          </Section>
          <Section title={`Aktuelle Kategorien (${kategorien.length})`}>
            {kategorien.length === 0
              ? <Empty text="Noch keine Kategorien angelegt." />
              : kategorien.map(k => (
                <div key={k.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:'#e8f5ee', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b' }}>label</span>
                  </div>
                  <div style={{ flex:1 }}>
                    <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{k.name}</p>
                    <p style={{ fontSize:10, color:'#9ca3af' }}>{k.schichten_count ?? 0} Schichten</p>
                  </div>
                  <button onClick={() => deleteKategorie(k)}
                    style={{ width:32, height:32, borderRadius:8, border:'none', background: (k.schichten_count ?? 0) > 0 ? '#f3f4f6' : '#fef2f2', cursor: (k.schichten_count ?? 0) > 0 ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity: (k.schichten_count ?? 0) > 0 ? .4 : 1 }}
                    disabled={(k.schichten_count ?? 0) > 0}>
                    <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                  </button>
                </div>
              ))
            }
          </Section>
          <div style={{ background:'#fffbeb', borderRadius:12, padding:'10px 14px', display:'flex', gap:8 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#b45309' }}>warning</span>
            <p style={{ fontSize:11, color:'#b45309', fontWeight:500 }}>Kategorien mit zugeordneten Schichten können nicht gelöscht werden.</p>
          </div>
        </div>
      )}

      {/* ── PUNKTEREGELN ── */}
      {tab === 'punkte' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Diese Werte werden beim Anlegen neuer Schichten als Standard verwendet." />
          <Section title="Punkte nach Schichtdauer">
            {[
              { label:'Kurze Schicht',   sub:'bis 3 Stunden',      key:'punkte_kurz'   as keyof Einstellungen },
              { label:'Normale Schicht', sub:'3 – 6 Stunden',      key:'punkte_normal' as keyof Einstellungen },
              { label:'Lange Schicht',   sub:'mehr als 6 Stunden',  key:'punkte_lang'   as keyof Einstellungen },
              { label:'Sondereinsatz',   sub:'auf Admin-Anfrage',   key:'punkte_sonder' as keyof Einstellungen },
            ].map(r => (
              <div key={r.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{r.label}</p><p style={{ fontSize:11, color:'#9ca3af' }}>{r.sub}</p></div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="number" min="0" value={settings[r.key] as number}
                    onChange={e => setSettings({...settings, [r.key]: parseInt(e.target.value)||0})}
                    style={{ width:60, textAlign:'center', border:'1.5px solid #e5e7eb', borderRadius:8, padding:'6px', fontSize:14, fontWeight:900, color:'#0d631b', fontFamily:'Lexend,sans-serif', outline:'none' }} />
                  <span style={{ fontSize:11, color:'#9ca3af' }}>Pkt</span>
                </div>
              </div>
            ))}
          </Section>
          <Section title="Bonus nach Veranstaltungstyp">
            {[
              { label:'Fußball-Turnier', key:'bonus_turnier' as keyof Einstellungen },
              { label:'Vereinsfest',     key:'bonus_fest'    as keyof Einstellungen },
            ].map(r => (
              <div key={r.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{r.label}</p>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="number" min="0" value={settings[r.key] as number}
                    onChange={e => setSettings({...settings, [r.key]: parseInt(e.target.value)||0})}
                    style={{ width:60, textAlign:'center', border:'1.5px solid #e5e7eb', borderRadius:8, padding:'6px', fontSize:14, fontWeight:900, color:'#0d631b', fontFamily:'Lexend,sans-serif', outline:'none' }} />
                  <span style={{ fontSize:11, color:'#9ca3af' }}>Pkt Bonus</span>
                </div>
              </div>
            ))}
          </Section>
          <Section title="Admin E-Mail">
            <F label="Einlösungs-Benachrichtigungen an">
              <input style={inp} type="email" value={settings.admin_email} onChange={e=>setSettings({...settings,admin_email:e.target.value})} placeholder="admin@ssv-boppard.de"/>
            </F>
          </Section>
          <button style={btnPrimary} onClick={saveSettings}>
            {saved ? '✅ Gespeichert!' : 'Einstellungen speichern'}
          </button>
        </div>
      )}

      {/* ── EINLÖSUNGEN ── */}
      {tab === 'einloesungen' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Bei jeder Einlösung wird eine E-Mail gesendet. Die Punkte werden sofort beim Mitglied abgezogen." />
          <Section title="Einlösungs-Anfragen">
            {reqs.length === 0
              ? <Empty text="Noch keine Anfragen" />
              : reqs.map(r => (
                <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                  <div>
                    <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{(r.profiles as any)?.name}</p>
                    <p style={{ fontSize:11, color:'#9ca3af' }}>{r.typ} · {r.punkte} Pkt</p>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {r.status === 'offen' ? (
                      <>
                        <button onClick={() => handleReq(r.id,'genehmigt')} style={{ ...btnSm, background:'#e8f5ee', color:'#0d631b' }}>✓</button>
                        <button onClick={() => handleReq(r.id,'abgelehnt')} style={{ ...btnSm, background:'#fef2f2', color:'#ef4444' }}>✕</button>
                      </>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:900, padding:'3px 10px', borderRadius:99, background: r.status==='genehmigt'?'#e8f5ee':'#fef2f2', color: r.status==='genehmigt'?'#0d631b':'#ef4444', fontFamily:'Lexend,sans-serif' }}>
                        {r.status}
                      </span>
                    )}
                  </div>
                </div>
              ))
            }
          </Section>
        </div>
      )}
    </div>
  )
}

// ── Hilfskomponenten ──
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:16, border:'1px solid #f3f4f6' }}>
      <p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>{title}</p>
      {children}
    </div>
  )
}
function Row({ title, sub, right }: { title: string; sub: string; right: React.ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
      <div><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{title}</p><p style={{ fontSize:11, color:'#9ca3af' }}>{sub}</p></div>
      {right}
    </div>
  )
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom:2 }}>
      <label style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  )
}
function InfoBox({ text }: { text: string }) {
  return (
    <div style={{ background:'#e8f5ee', borderRadius:12, padding:'10px 14px', display:'flex', gap:8 }}>
      <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b', marginTop:1 }}>info</span>
      <p style={{ fontSize:12, color:'#0d631b', fontWeight:500, lineHeight:1.5 }}>{text}</p>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <p style={{ textAlign:'center', padding:'20px 0', color:'#9ca3af', fontSize:13 }}>{text}</p>
}

const inp: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:13, fontFamily:'Manrope,sans-serif', outline:'none', background:'#fff' }
const btnPrimary: React.CSSProperties = { width:'100%', padding:12, background:'#0d631b', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:13, cursor:'pointer' }
const btnSm: React.CSSProperties = { padding:'6px 12px', border:'none', borderRadius:8, fontSize:12, fontWeight:900, cursor:'pointer', fontFamily:'Lexend,sans-serif' }