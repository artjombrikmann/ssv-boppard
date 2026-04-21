import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Profile, Schichtbelegung, Veranstaltung, Einstellungen, GutscheinAnfrage, Kategorie, Schicht } from '../types'

interface Props { profile: Profile; onTabChange: (tab: string) => void }
type AdminTab = 'uebersicht' | 'veranstaltungen' | 'kategorien' | 'punkte' | 'einloesungen' | 'mitglieder' | 'archiv'

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
  const [archiv,     setArchiv]     = useState<VeranstaltungMitAuslastung[]>([])
  const [reqs,       setReqs]       = useState<GutscheinAnfrage[]>([])
  const [kategorien, setKategorien] = useState<Kategorie[]>([])
  const [settings,   setSettings]   = useState<Einstellungen>({ id:1, punkte_kurz:5, punkte_normal:10, punkte_lang:15, punkte_sonder:20, bonus_turnier:3, bonus_fest:2, admin_email:'geschaeftsfuehrung@ssv-boppard.de' })
  const [newEv,      setNewEv]      = useState({ name:'', datum:'', datum_ende:'', ort:'', kategorie:'heimspiel' })
  const [newSh,      setNewSh]      = useState({ bezeichnung:'', veranstaltung_id:0, kategorie_id:'', startzeit:'09:00', endzeit:'13:00', plaetze:3, punkte:10, beschreibung:'' })
  const [newKat,     setNewKat]     = useState('')
  const [saved,      setSaved]      = useState(false)
  const [toast,      setToast]      = useState('')
  const [expandedEv, setExpandedEv] = useState<number | null>(null)
  const [evStep,        setEvStep]        = useState<1 | 2>(1)
  const [activeEvId,    setActiveEvId]    = useState<number | null>(null)
  const [activeEvName,  setActiveEvName]  = useState('')
  const [selectedUser,   setSelectedUser]   = useState<Profile | null>(null)
  const [userSearch,     setUserSearch]     = useState('')
  const [newTemp,        setNewTemp]        = useState({ vorname:'', nachname:'', email:'', typ:'Mitglied' })
  const [tempLoading,    setTempLoading]    = useState(false)
  const [allSchichten,   setAllSchichten]   = useState<Schicht[]>([])
  const [userBelegungen, setUserBelegungen] = useState<number[]>([])

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

    const mitAuslastung = (evList: Veranstaltung[]) => evList.map(ev => {
      const schichten = alleSchichten.filter(s => s.veranstaltung_id === ev.id)
      const gesamtPlaetze = schichten.reduce((sum, s) => sum + s.plaetze, 0)
      const belegtePlaetze = schichten.reduce((sum, s) => sum + s.belegt, 0)
      const auslastung = gesamtPlaetze > 0 ? Math.round((belegtePlaetze / gesamtPlaetze) * 100) : 0
      return { ...ev, schichten, gesamtPlaetze, belegtePlaetze, auslastung }
    })

    setBookings(b.data ?? [])
    setMembers(m.data ?? [])
    setEvents(mitAuslastung(alleEvents.filter(ev => ev.status !== 'Abgeschlossen')))
    setArchiv(mitAuslastung(alleEvents.filter(ev => ev.status === 'Abgeschlossen')))
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
    const { data, error } = await supabase.from('veranstaltungen').insert({
      ...newEv, datum_ende: newEv.datum_ende || null, status: 'Geplant'
    }).select().single()
    if (error) { showToast('❌ Fehler: ' + error.message); return }
    showToast('✅ Veranstaltung angelegt!')
    setNewEv({ name:'', datum:'', datum_ende:'', ort:'', kategorie:'heimspiel' })
    await loadAll()
    setActiveEvId(data.id); setActiveEvName(data.name)
    setNewSh(prev => ({ ...prev, veranstaltung_id: data.id }))
    setEvStep(2)
  }

  async function addShift() {
    if (!newSh.bezeichnung || !newSh.veranstaltung_id) { showToast('❌ Bezeichnung und Veranstaltung pflicht'); return }
    await supabase.from('schichten').insert({ ...newSh, belegt: 0 })
    setNewSh(prev => ({ ...prev, bezeichnung:'', startzeit:'09:00', endzeit:'13:00', plaetze:3, punkte:10, beschreibung:'' }))
    showToast('✅ Schicht angelegt!'); loadAll()
  }

  async function addKategorie() {
    if (!newKat.trim()) { showToast('❌ Bitte Namen eingeben'); return }
    if (kategorien.find(k => k.name.toLowerCase() === newKat.toLowerCase())) { showToast('❌ Kategorie existiert bereits'); return }
    await supabase.from('kategorien').insert({ name: newKat.trim() })
    setNewKat(''); showToast(`✅ Kategorie "${newKat}" hinzugefügt!`); loadAll()
  }

  async function deleteKategorie(k: Kategorie) {
    if ((k.schichten_count ?? 0) > 0) { showToast('❌ Kategorie hat noch Schichten'); return }
    await supabase.from('kategorien').delete().eq('id', k.id)
    showToast('🗑️ Kategorie gelöscht'); loadAll()
  }

  async function deleteVeranstaltung(ev: VeranstaltungMitAuslastung) {
    const ok = window.confirm(`Veranstaltung "${ev.name}" wirklich löschen?\n\nAlle ${ev.schichten.length} Schichten werden ebenfalls gelöscht.`)
    if (!ok) return
    const { error } = await supabase.from('veranstaltungen').delete().eq('id', ev.id)
    if (error) showToast('❌ Fehler: ' + error.message)
    else { showToast('🗑️ Veranstaltung gelöscht'); if (activeEvId === ev.id) { setEvStep(1); setActiveEvId(null) }; loadAll() }
  }

  async function deleteSchicht(s: Schicht) {
    const ok = window.confirm(`Schicht "${s.bezeichnung}" wirklich löschen?${s.belegt > 0 ? `\n\n⚠️ ${s.belegt} Mitglied(er) werden abgemeldet.` : ''}`)
    if (!ok) return
    const { error } = await supabase.from('schichten').delete().eq('id', s.id)
    if (error) showToast('❌ Fehler: ' + error.message)
    else { showToast('🗑️ Schicht gelöscht'); loadAll() }
  }

  async function saveSettings() {
    await supabase.from('einstellungen').upsert({ id: 1, ...settings })
    setSaved(true); setTimeout(() => setSaved(false), 2000); showToast('✅ Einstellungen gespeichert!')
  }

  async function handleReq(id: number, status: string) {
    await supabase.from('gutschein_anfragen').update({ status }).eq('id', id)
    showToast(status === 'genehmigt' ? '✅ Genehmigt!' : '❌ Abgelehnt'); loadAll()
  }

  function auslastungFarbe(pct: number) {
    if (pct >= 80) return '#0d631b'
    if (pct >= 50) return '#f59e0b'
    return '#ef4444'
  }

  async function loadAllSchichten(userId?: string) {
    const { data } = await supabase.from('schichten').select('*, veranstaltungen(name)').order('startzeit')
    setAllSchichten(data ?? [])
    if (userId) {
      const { data: bk } = await supabase.from('schichtbelegungen').select('schicht_id').eq('mitglied_id', userId)
      setUserBelegungen((bk ?? []).map((b: any) => b.schicht_id))
    }
  }

  async function addTempUser() {
    if (!newTemp.vorname.trim() || !newTemp.nachname.trim()) { showToast('❌ Vor- und Nachname pflicht'); return }
    setTempLoading(true)
    const name = `${newTemp.vorname.trim()} ${newTemp.nachname.trim()}`
    const { error } = await supabase.from('profiles').insert({
      id: crypto.randomUUID(), name, display_name: newTemp.vorname.trim(),
      email: newTemp.email || `temp_${Date.now()}@ssv-boppard.intern`,
      punkte: 0, schichten_count: 0, is_admin: false, is_temp: true, temp_typ: newTemp.typ,
    })
    if (error) showToast('❌ Fehler: ' + error.message)
    else { showToast(`✅ ${name} angelegt!`); setNewTemp({ vorname:'', nachname:'', email:'', typ:'Mitglied' }); loadAll() }
    setTempLoading(false)
  }

  async function assignSchicht(user: Profile, schicht: Schicht) {
    const { data: existing } = await supabase.from('schichtbelegungen').select('id').eq('schicht_id', schicht.id).eq('mitglied_id', user.id)
    if (existing && existing.length > 0) { showToast('⚠️ Bereits eingetragen'); return }
    if (schicht.belegt >= schicht.plaetze) { showToast('❌ Schicht ist voll'); return }
    await supabase.from('schichtbelegungen').insert({ schicht_id: schicht.id, mitglied_id: user.id, status: 'Angemeldet' })
    showToast(`✅ ${user.display_name || user.name} → ${schicht.bezeichnung}`)
    loadAll(); loadAllSchichten()
  }

  async function removeAssignment(user: Profile, schicht: Schicht) {
    const ok = window.confirm(`${user.display_name || user.name} aus "${schicht.bezeichnung}" austragen?`)
    if (!ok) return
    await supabase.from('schichtbelegungen').delete().eq('schicht_id', schicht.id).eq('mitglied_id', user.id)
    showToast('🗑️ Zuweisung entfernt'); loadAll(); loadAllSchichten()
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id:'uebersicht', label:'Übersicht' }, { id:'veranstaltungen', label:'Events' },
    { id:'kategorien', label:'Kategorien' }, { id:'punkte', label:'Punkte' },
    { id:'einloesungen', label:'Einlösungen' }, { id:'mitglieder', label:'User' },
    { id:'archiv', label:'Archiv' },
  ]

  const activeEv = events.find(e => e.id === activeEvId)

  return (
    <div style={{ padding:'20px 16px', display:'flex', flexDirection:'column', gap:16 }}>
      {toast && <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', background:'#1a1a1a', color:'#fff', padding:'10px 20px', borderRadius:99, fontSize:13, fontWeight:600, zIndex:500, whiteSpace:'nowrap', fontFamily:'Manrope,sans-serif' }}>{toast}</div>}

      <h1 style={{ fontFamily:'Lexend,sans-serif', fontWeight:800, fontSize:22 }}>Admin-Bereich</h1>

      <div style={{ display:'flex', gap:1, background:'#eceeec', borderRadius:14, padding:4, overflowX:'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex:1, padding:'8px 4px', borderRadius:10, border:'none', background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0d631b' : '#5d5e61', fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, cursor:'pointer', whiteSpace:'nowrap', boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,.08)' : 'none', transition:'all .15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'uebersicht' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#0d631b', borderRadius:20, padding:20, color:'#fff' }}>
            <p style={{ fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'.08em', opacity:.7, marginBottom:12 }}>Vereins-Übersicht</p>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              {[{ val: bookings.filter(b => !b.punkte_vergeben).length, label:'Ausstehend' }, { val: members.length, label:'Mitglieder' }, { val: events.length, label:'Events' }].map(s => (
                <div key={s.label}><p style={{ fontFamily:'Lexend,sans-serif', fontSize:24, fontWeight:900 }}>{s.val}</p><p style={{ fontSize:9, fontWeight:800, opacity:.7, textTransform:'uppercase', letterSpacing:'.06em' }}>{s.label}</p></div>
              ))}
            </div>
          </div>

          <Section title={`Veranstaltungen & Auslastung (${events.length})`}>
            {events.length === 0 ? <Empty text="Keine aktiven Veranstaltungen." /> : events.map(ev => (
              <div key={ev.id} style={{ borderBottom:'1px solid #f9fafb' }}>
                <div style={{ padding:'12px 0' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ cursor:'pointer', flex:1 }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{ev.name}</p>
                      <p style={{ fontSize:11, color:'#9ca3af' }}>{new Date(ev.datum).toLocaleDateString('de-DE')} · {ev.ort}</p>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ textAlign:'right', cursor:'pointer' }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                        <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:18, color: auslastungFarbe(ev.auslastung) }}>{ev.auslastung}%</p>
                        <p style={{ fontSize:10, color:'#9ca3af' }}>{ev.belegtePlaetze}/{ev.gesamtPlaetze} Plätze</p>
                      </div>
                      <button onClick={() => deleteVeranstaltung(ev)} style={{ width:32, height:32, borderRadius:8, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ height:6, background:'#f3f4f6', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${ev.auslastung}%`, background: auslastungFarbe(ev.auslastung), borderRadius:99, transition:'width .4s ease' }} />
                  </div>
                  <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', cursor:'pointer' }} onClick={() => setExpandedEv(expandedEv === ev.id ? null : ev.id)}>
                    <span style={{ fontSize:10, color:'#9ca3af' }}>{ev.schichten.length} Schichten</span>
                    <span className="material-symbols-outlined" style={{ fontSize:14, color:'#9ca3af' }}>{expandedEv === ev.id ? 'expand_less' : 'expand_more'}</span>
                  </div>
                </div>
                {expandedEv === ev.id && ev.schichten.map(s => {
                  const pct = s.plaetze > 0 ? Math.round((s.belegt / s.plaetze) * 100) : 0
                  return (
                    <div key={s.id} style={{ background:'#f8faf8', borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                        <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:600, fontSize:12 }}>{s.bezeichnung}</p>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, color: auslastungFarbe(pct) }}>{s.belegt}/{s.plaetze}</span>
                          <button onClick={() => deleteSchicht(s)} style={{ width:24, height:24, borderRadius:6, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <span className="material-symbols-outlined" style={{ fontSize:13, color:'#ef4444' }}>delete</span>
                          </button>
                        </div>
                      </div>
                      <div style={{ height:4, background:'#e5e7eb', borderRadius:99, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background: auslastungFarbe(pct), borderRadius:99 }} />
                      </div>
                      <p style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>{s.startzeit} – {s.endzeit} · {s.punkte} Pkt</p>
                    </div>
                  )
                })}
              </div>
            ))}
          </Section>

          <Section title="Ausstehende Punkte vergeben">
            {bookings.filter(b => !b.punkte_vergeben).length === 0 ? <Empty text="Alle Punkte vergeben ✅" />
              : bookings.filter(b => !b.punkte_vergeben).map(b => (
                <Row key={b.id} title={(b.profiles as any)?.name ?? '–'} sub={b.schichten?.bezeichnung ?? '–'}
                  right={<button onClick={() => givePoints(b)} style={btnSm}>✓ {b.schichten?.punkte} Pkt</button>} />
              ))}
          </Section>

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

      {tab === 'veranstaltungen' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#fff', borderRadius:16, padding:16, border:'1px solid #f3f4f6' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, cursor: evStep === 2 ? 'pointer' : 'default' }} onClick={() => evStep === 2 && setEvStep(1)}>
                <div style={{ width:24, height:24, borderRadius:'50%', background: evStep === 1 ? '#0d631b' : '#e8f5ee', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:900, color: evStep === 1 ? '#fff' : '#0d631b' }}>1</span>
                </div>
                <span style={{ fontSize:12, fontWeight: evStep === 1 ? 700 : 400, color: evStep === 1 ? '#0d631b' : '#9ca3af', fontFamily:'Lexend,sans-serif' }}>Veranstaltung</span>
              </div>
              <div style={{ flex:1, height:2, background: evStep === 2 ? '#0d631b' : '#e5e7eb', borderRadius:2 }} />
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background: evStep === 2 ? '#0d631b' : '#f3f4f6', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:900, color: evStep === 2 ? '#fff' : '#9ca3af' }}>2</span>
                </div>
                <span style={{ fontSize:12, fontWeight: evStep === 2 ? 700 : 400, color: evStep === 2 ? '#0d631b' : '#9ca3af', fontFamily:'Lexend,sans-serif' }}>Schichten</span>
              </div>
            </div>
            {evStep === 2 && activeEvName && (
              <p style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>
                Veranstaltung: <strong style={{ color:'#0d631b' }}>{activeEvName}</strong>
                <button onClick={() => setEvStep(1)} style={{ marginLeft:8, background:'none', border:'none', color:'#9ca3af', fontSize:11, cursor:'pointer', textDecoration:'underline' }}>ändern</button>
              </p>
            )}
          </div>

          {evStep === 1 && (
            <>
              <InfoBox text="Lege zuerst eine Veranstaltung an. Danach kannst du direkt Schichten hinzufügen." />
              <Section title="Neue Veranstaltung anlegen">
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <F label="Name"><input style={inp} value={newEv.name} onChange={e=>setNewEv({...newEv,name:e.target.value})} placeholder="z.B. Sommerfest 2025"/></F>
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
                  <button style={btnPrimary} onClick={addEvent}>Weiter: Schichten anlegen →</button>
                </div>
              </Section>
              {events.length > 0 && (
                <Section title="Aktive Veranstaltungen">
                  {events.map(ev => (
                    <div key={ev.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                      <div style={{ flex:1, cursor:'pointer' }} onClick={() => { setActiveEvId(ev.id); setActiveEvName(ev.name); setNewSh(prev => ({ ...prev, veranstaltung_id: ev.id })); setEvStep(2) }}>
                        <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13 }}>{ev.name}</p>
                        <p style={{ fontSize:10, color:'#9ca3af' }}>{new Date(ev.datum).toLocaleDateString('de-DE')} · {ev.schichten.length} Schichten</p>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => { setActiveEvId(ev.id); setActiveEvName(ev.name); setNewSh(prev => ({ ...prev, veranstaltung_id: ev.id })); setEvStep(2) }} style={{ ...btnSm, background:'#e8f5ee', color:'#0d631b', fontSize:11 }}>Schichten</button>
                        <button onClick={() => deleteVeranstaltung(ev)} style={{ width:32, height:32, borderRadius:8, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}

          {evStep === 2 && (
            <>
              <Section title={`Schichten von ${activeEvName} (${activeEv?.schichten.length ?? 0})`}>
                {!activeEv || activeEv.schichten.length === 0 ? <Empty text="Noch keine Schichten – lege die erste an!" />
                  : activeEv.schichten.map(s => {
                    const pct = s.plaetze > 0 ? Math.round((s.belegt / s.plaetze) * 100) : 0
                    const farbe = auslastungFarbe(pct)
                    return (
                      <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                        <div style={{ flex:1 }}>
                          <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13 }}>{s.bezeichnung}</p>
                          <p style={{ fontSize:10, color:'#9ca3af' }}>{s.startzeit?.slice(0,5)}–{s.endzeit?.slice(0,5)} · {s.punkte} Pkt</p>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                            <div style={{ flex:1, height:4, background:'#f3f4f6', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background: farbe, borderRadius:99 }} />
                            </div>
                            <span style={{ fontSize:10, fontWeight:700, color: farbe }}>{s.belegt}/{s.plaetze}</span>
                          </div>
                        </div>
                        <button onClick={() => deleteSchicht(s)} style={{ width:28, height:28, borderRadius:6, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', marginLeft:10, flexShrink:0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize:14, color:'#ef4444' }}>delete</span>
                        </button>
                      </div>
                    )
                  })}
              </Section>
              <Section title="Neue Schicht hinzufügen">
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <F label="Bezeichnung"><input style={inp} value={newSh.bezeichnung} onChange={e=>setNewSh({...newSh,bezeichnung:e.target.value})} placeholder="z.B. Kasse – Vormittag"/></F>
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
                  <F label="Aufgabe (optional)"><input style={inp} value={newSh.beschreibung} onChange={e=>setNewSh({...newSh,beschreibung:e.target.value})} placeholder="Kurze Beschreibung"/></F>
                  <button style={btnPrimary} onClick={addShift}>+ Schicht anlegen</button>
                </div>
              </Section>
              <button onClick={() => setEvStep(1)} style={{ background:'none', border:'none', color:'#9ca3af', fontSize:12, cursor:'pointer', textAlign:'center', padding:'4px 0' }}>← Zurück zu Veranstaltungen</button>
            </>
          )}
        </div>
      )}

      {tab === 'archiv' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text={`${archiv.length} abgeschlossene Veranstaltung(en). Punkte wurden bereits automatisch vergeben.`} />
          <Section title={`Archiv (${archiv.length})`}>
            {archiv.length === 0 ? <Empty text="Noch keine abgeschlossenen Veranstaltungen." /> : archiv.map(ev => (
              <div key={ev.id} style={{ padding:'12px 0', borderBottom:'1px solid #f9fafb' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{ev.name}</p>
                      <span style={{ fontSize:9, fontWeight:900, background:'#f3f4f6', color:'#9ca3af', padding:'2px 8px', borderRadius:99, fontFamily:'Lexend,sans-serif' }}>Abgeschlossen</span>
                    </div>
                    <p style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{new Date(ev.datum).toLocaleDateString('de-DE')} · {ev.ort} · {ev.schichten.length} Schichten</p>
                    <p style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{ev.belegtePlaetze}/{ev.gesamtPlaetze} Plätze · {ev.auslastung}% Auslastung</p>
                  </div>
                  <button onClick={() => deleteVeranstaltung(ev)} style={{ width:32, height:32, borderRadius:8, border:'none', background:'#fef2f2', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                  </button>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}

      {tab === 'kategorien' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Diese Kategorien erscheinen als Filter im Schicht-Marktplatz." />
          <Section title="Neue Kategorie">
            <div style={{ display:'flex', gap:8 }}>
              <input style={{ ...inp, flex:1 }} value={newKat} onChange={e=>setNewKat(e.target.value)} placeholder="z.B. Sicherheitsdienst" onKeyDown={e => e.key === 'Enter' && addKategorie()} />
              <button onClick={addKategorie} style={{ ...btnPrimary, width:'auto', padding:'10px 16px', flexShrink:0 }}><span className="material-symbols-outlined" style={{ fontSize:18 }}>add</span></button>
            </div>
          </Section>
          <Section title={`Aktuelle Kategorien (${kategorien.length})`}>
            {kategorien.length === 0 ? <Empty text="Noch keine Kategorien angelegt." /> : kategorien.map(k => (
              <div key={k.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div style={{ width:32, height:32, borderRadius:8, background:'#e8f5ee', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b' }}>label</span>
                </div>
                <div style={{ flex:1 }}><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{k.name}</p><p style={{ fontSize:10, color:'#9ca3af' }}>{k.schichten_count ?? 0} Schichten</p></div>
                <button onClick={() => deleteKategorie(k)} style={{ width:32, height:32, borderRadius:8, border:'none', background: (k.schichten_count ?? 0) > 0 ? '#f3f4f6' : '#fef2f2', cursor: (k.schichten_count ?? 0) > 0 ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', opacity: (k.schichten_count ?? 0) > 0 ? .4 : 1 }} disabled={(k.schichten_count ?? 0) > 0}>
                  <span className="material-symbols-outlined" style={{ fontSize:16, color:'#ef4444' }}>delete</span>
                </button>
              </div>
            ))}
          </Section>
        </div>
      )}

      {tab === 'punkte' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Diese Werte werden beim Anlegen neuer Schichten als Standard verwendet." />
          <Section title="Punkte nach Schichtdauer">
            {[{ label:'Kurze Schicht', sub:'bis 3 Stunden', key:'punkte_kurz' as keyof Einstellungen }, { label:'Normale Schicht', sub:'3 – 6 Stunden', key:'punkte_normal' as keyof Einstellungen }, { label:'Lange Schicht', sub:'mehr als 6 Stunden', key:'punkte_lang' as keyof Einstellungen }, { label:'Sondereinsatz', sub:'auf Admin-Anfrage', key:'punkte_sonder' as keyof Einstellungen }].map(r => (
              <div key={r.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{r.label}</p><p style={{ fontSize:11, color:'#9ca3af' }}>{r.sub}</p></div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="number" min="0" value={settings[r.key] as number} onChange={e => setSettings({...settings, [r.key]: parseInt(e.target.value)||0})} style={{ width:60, textAlign:'center', border:'1.5px solid #e5e7eb', borderRadius:8, padding:'6px', fontSize:14, fontWeight:900, color:'#0d631b', fontFamily:'Lexend,sans-serif', outline:'none' }} />
                  <span style={{ fontSize:11, color:'#9ca3af' }}>Pkt</span>
                </div>
              </div>
            ))}
          </Section>
          <Section title="Admin E-Mail">
            <F label="Einlösungs-Benachrichtigungen an"><input style={inp} type="email" value={settings.admin_email} onChange={e=>setSettings({...settings,admin_email:e.target.value})} placeholder="admin@ssv-boppard.de"/></F>
          </Section>
          <button style={btnPrimary} onClick={saveSettings}>{saved ? '✅ Gespeichert!' : 'Einstellungen speichern'}</button>
        </div>
      )}

      {tab === 'mitglieder' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Lege temporäre User an oder weise Mitglieder direkt Schichten zu." />
          <Section title="Temporären User anlegen">
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <F label="Vorname"><input style={inp} value={newTemp.vorname} onChange={e=>setNewTemp({...newTemp,vorname:e.target.value})} placeholder="Max"/></F>
                <F label="Nachname"><input style={inp} value={newTemp.nachname} onChange={e=>setNewTemp({...newTemp,nachname:e.target.value})} placeholder="Mustermann"/></F>
              </div>
              <F label="E-Mail (optional)"><input style={inp} type="email" value={newTemp.email} onChange={e=>setNewTemp({...newTemp,email:e.target.value})} placeholder="max@beispiel.de"/></F>
              <F label="Typ"><select style={inp} value={newTemp.typ} onChange={e=>setNewTemp({...newTemp,typ:e.target.value})}><option>Mitglied</option><option>Gast</option><option>Extern</option></select></F>
              <button style={btnPrimary} onClick={addTempUser} disabled={tempLoading}>{tempLoading ? 'Wird angelegt...' : 'Temporären User anlegen'}</button>
            </div>
          </Section>
          <Section title={`Alle User (${members.length})`}>
            <input style={{ ...inp, marginBottom:10 }} placeholder="User suchen..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
            {members.filter(m => (m.display_name || m.name || '').toLowerCase().includes(userSearch.toLowerCase())).map(m => (
              <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div style={{ width:34, height:34, borderRadius:'50%', background: (m as any).is_temp ? '#e8f0fe' : '#e8f5ee', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:10, color: (m as any).is_temp ? '#1a3a7a' : '#0d631b' }}>{(m.display_name || m.name)?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</span>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13 }}>{m.display_name || m.name}{(m as any).is_temp && <span style={{ marginLeft:6, fontSize:9, background:'#e8f0fe', color:'#1a3a7a', padding:'1px 6px', borderRadius:99, fontWeight:900 }}>{(m as any).temp_typ ?? 'TEMP'}</span>}</p>
                  <p style={{ fontSize:10, color:'#9ca3af' }}>{(m as any).is_temp ? 'Kein Login · keine Punkte' : `${m.punkte} Pkt · ${m.email}`}</p>
                </div>
                <button onClick={() => { setSelectedUser(selectedUser?.id === m.id ? null : m); loadAllSchichten(m.id) }} style={{ ...btnSm, background: selectedUser?.id === m.id ? '#0d631b' : '#e8f5ee', color: selectedUser?.id === m.id ? '#fff' : '#0d631b', fontSize:11 }}>{selectedUser?.id === m.id ? 'Schließen' : 'Zuweisen'}</button>
              </div>
            ))}
          </Section>
          {selectedUser && (
            <Section title={`Schichten zuweisen – ${selectedUser.display_name || selectedUser.name}`}>
              {allSchichten.length === 0 ? <Empty text="Keine Schichten vorhanden." /> : allSchichten.map(s => {
                const voll = s.belegt >= s.plaetze
                const istZugewiesen = userBelegungen.includes(s.id)
                return (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                    <div>
                      <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13 }}>{s.bezeichnung}{istZugewiesen && <span style={{ marginLeft:6, fontSize:9, background:'#e8f5ee', color:'#0d631b', padding:'1px 6px', borderRadius:99, fontWeight:900 }}>✓ Dabei</span>}</p>
                      <p style={{ fontSize:10, color:'#9ca3af' }}>{(s as any).veranstaltungen?.name} · {s.startzeit?.slice(0,5)}–{s.endzeit?.slice(0,5)} · {s.belegt}/{s.plaetze} belegt</p>
                    </div>
                    {istZugewiesen ? (
                      <button onClick={() => { removeAssignment(selectedUser!, s); setUserBelegungen(prev => prev.filter(id => id !== s.id)) }} style={{ ...btnSm, background:'#fef2f2', color:'#ef4444', fontSize:11 }}>Entfernen</button>
                    ) : (
                      <button onClick={() => { assignSchicht(selectedUser!, s); if (!voll) setUserBelegungen(prev => [...prev, s.id]) }} disabled={voll} style={{ ...btnSm, background: voll ? '#f3f4f6' : '#0d631b', color: voll ? '#9ca3af' : '#fff', fontSize:11, cursor: voll ? 'not-allowed' : 'pointer' }}>{voll ? 'Voll' : '+ Zuweisen'}</button>
                    )}
                  </div>
                )
              })}
            </Section>
          )}
        </div>
      )}

      {tab === 'einloesungen' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <InfoBox text="Bei jeder Einlösung wird eine E-Mail gesendet. Die Punkte werden sofort abgezogen." />
          <Section title="Einlösungs-Anfragen">
            {reqs.length === 0 ? <Empty text="Noch keine Anfragen" /> : reqs.map(r => (
              <div key={r.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}>
                <div><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{(r.profiles as any)?.name}</p><p style={{ fontSize:11, color:'#9ca3af' }}>{r.typ} · {r.punkte} Pkt</p></div>
                <div style={{ display:'flex', gap:6 }}>
                  {r.status === 'offen' ? (<><button onClick={() => handleReq(r.id,'genehmigt')} style={{ ...btnSm, background:'#e8f5ee', color:'#0d631b' }}>✓</button><button onClick={() => handleReq(r.id,'abgelehnt')} style={{ ...btnSm, background:'#fef2f2', color:'#ef4444' }}>✕</button></>) : (
                    <span style={{ fontSize:10, fontWeight:900, padding:'3px 10px', borderRadius:99, background: r.status==='genehmigt'?'#e8f5ee':'#fef2f2', color: r.status==='genehmigt'?'#0d631b':'#ef4444', fontFamily:'Lexend,sans-serif' }}>{r.status}</span>
                  )}
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div style={{ background:'#fff', borderRadius:16, padding:16, border:'1px solid #f3f4f6' }}><p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:12 }}>{title}</p>{children}</div>)
}
function Row({ title, sub, right }: { title: string; sub: string; right: React.ReactNode }) {
  return (<div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f9fafb' }}><div><p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14 }}>{title}</p><p style={{ fontSize:11, color:'#9ca3af' }}>{sub}</p></div>{right}</div>)
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div style={{ marginBottom:2 }}><label style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:5 }}>{label}</label>{children}</div>)
}
function InfoBox({ text }: { text: string }) {
  return (<div style={{ background:'#e8f5ee', borderRadius:12, padding:'10px 14px', display:'flex', gap:8 }}><span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b', marginTop:1 }}>info</span><p style={{ fontSize:12, color:'#0d631b', fontWeight:500, lineHeight:1.5 }}>{text}</p></div>)
}
function Empty({ text }: { text: string }) {
  return <p style={{ textAlign:'center', padding:'20px 0', color:'#9ca3af', fontSize:13 }}>{text}</p>
}

const inp: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1.5px solid #e5e7eb', borderRadius:10, fontSize:13, fontFamily:'Manrope,sans-serif', outline:'none', background:'#fff' }
const btnPrimary: React.CSSProperties = { width:'100%', padding:12, background:'#0d631b', color:'#fff', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:13, cursor:'pointer' }
const btnSm: React.CSSProperties = { padding:'6px 12px', border:'none', borderRadius:8, fontSize:12, fontWeight:900, cursor:'pointer', fontFamily:'Lexend,sans-serif' }
