import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Profile } from './types'
import './styles.css'
import Login from './screens/Login'
import Home from './screens/Home'
import Marktplatz from './screens/Marktplatz'
import MeineSchichten from './screens/MeineSchichten'
import Rangliste from './screens/Rangliste'
import Shop from './screens/Shop'
import Verwaltung from './screens/Verwaltung'
import Profil from './screens/Profil'

type TabId = 'home' | 'marktplatz' | 'meineschichten' | 'rangliste' | 'shop' | 'verwaltung' | 'profil'

interface Benachrichtigung {
  id: number
  typ: string
  titel: string
  nachricht: string
  punkte: number
  gelesen: boolean
  created_at: string
}

const NAV_TABS = [
  { id: 'home'            as TabId, icon: 'home',           label: 'Home' },
  { id: 'marktplatz'     as TabId, icon: 'event_available', label: 'Marktplatz' },
  { id: 'meineschichten' as TabId, icon: 'calendar_today',  label: 'Meine' },
  { id: 'rangliste'      as TabId, icon: 'leaderboard',     label: 'Rangliste' },
  { id: 'shop'           as TabId, icon: 'shopping_bag',    label: 'Shop' },
]

export default function App() {
  const [session, setSession]                     = useState<any>(null)
  const [profile, setProfile]                     = useState<Profile | null>(null)
  const [activeTab, setActiveTab]                 = useState<TabId>('home')
  const [loading, setLoading]                     = useState(true)
  const [showOverlay, setShowOverlay]             = useState(false)
  const [showBenachrichtigungen, setShowBenachrichtigungen] = useState(false)
  const [benachrichtigungen, setBenachrichtigungen] = useState<Benachrichtigung[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      console.log('PROFIL DATA:', data)
      console.log('PROFIL ERROR:', null)
      setProfile(data ?? null)
      if (data) loadBenachrichtigungen()
    } finally {
      setLoading(false)
    }
  }

  async function loadBenachrichtigungen() {
    const { data } = await supabase
      .from('benachrichtigungen')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
    setBenachrichtigungen(data ?? [])
  }

  async function alleAlsGelesenMarkieren() {
    await supabase
      .from('benachrichtigungen')
      .update({ gelesen: true })
      .eq('gelesen', false)
    setBenachrichtigungen(prev => prev.map(b => ({ ...b, gelesen: true })))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setShowOverlay(false)
  }

  const ungelesen = benachrichtigungen.filter(b => !b.gelesen).length

  function zeitFormatieren(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:12 }}>
      <img src="/LOGO-SSV-BOPPARD-_1_.png" alt="SSV Boppard" style={{ width:80, height:80, objectFit:'contain' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
      <p style={{ color:'#5d5e61', fontSize:14, fontFamily:'Manrope,sans-serif' }}>SSV Boppard wird geladen...</p>
    </div>
  )

  if (!session) return <Login />

  if (!profile) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'100vh', gap:12 }}>
      <p style={{ color:'#5d5e61', fontSize:14, fontFamily:'Manrope,sans-serif' }}>Profil wird geladen...</p>
    </div>
  )

  const tabs = profile.is_admin
    ? [...NAV_TABS, { id: 'verwaltung' as TabId, icon: 'shield', label: 'Admin' }]
    : NAV_TABS

  const screenProps = { profile, onTabChange: (tab: string) => setActiveTab(tab as TabId) }

  return (
    <div style={{ maxWidth:420, margin:'0 auto', minHeight:'100vh', background:'#f8faf8', position:'relative' }}>

      {/* Header */}
      <header style={{
        position:'sticky', top:0, zIndex:50,
        background:'rgba(255,255,255,.92)', backdropFilter:'blur(12px)',
        borderBottom:'1px solid #f3f4f6',
        padding:'12px 16px',
        display:'flex', alignItems:'center', justifyContent:'space-between'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', background:'#fff', border:'1.5px solid #e8f5ee', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <img src="/LOGO-SSV-BOPPARD-_1_.png" alt="SSV" style={{ width:32, height:32, objectFit:'contain' }}
              onError={(e) => {
                const el = e.target as HTMLImageElement
                el.style.display = 'none'
                el.parentElement!.innerHTML = '<span style="font-family:Lexend,sans-serif;font-weight:900;font-size:10px;color:#0d631b">SSV</span>'
              }} />
          </div>
          <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, color:'#0d631b', fontSize:14, textTransform:'uppercase', letterSpacing:'0.1em' }}>
            SSV Boppard
          </span>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>

          {/* Glocke */}
          <div style={{ position:'relative' }}>
            <button
              onClick={() => {
                setShowBenachrichtigungen(v => !v)
                setShowOverlay(false)
              }}
              style={{
                width:34, height:34, borderRadius:'50%', border:'none',
                background: ungelesen > 0 ? '#e8f5ee' : 'none',
                cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                position:'relative'
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize:20, color: ungelesen > 0 ? '#0d631b' : '#9ca3af' }}>
                notifications
              </span>
              {ungelesen > 0 && (
                <span style={{
                  position:'absolute', top:2, right:2,
                  width:16, height:16, borderRadius:'50%',
                  background:'#ef4444', color:'#fff',
                  fontSize:9, fontWeight:900, fontFamily:'Lexend,sans-serif',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  border:'1.5px solid #fff'
                }}>
                  {ungelesen > 9 ? '9+' : ungelesen}
                </span>
              )}
            </button>

            {/* Benachrichtigungs-Dropdown */}
            {showBenachrichtigungen && (
              <>
                <div style={{ position:'fixed', inset:0, zIndex:90 }} onClick={() => setShowBenachrichtigungen(false)} />
                <div style={{
                  position:'absolute', top:42, right:0, zIndex:100,
                  background:'#fff', borderRadius:16,
                  boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
                  border:'1px solid #f3f4f6',
                  width:300, overflow:'hidden'
                }}>
                  {/* Header */}
                  <div style={{ padding:'14px 16px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#111827' }}>
                      Benachrichtigungen
                    </span>
                    {ungelesen > 0 && (
                      <button
                        onClick={alleAlsGelesenMarkieren}
                        style={{ background:'none', border:'none', color:'#0d631b', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Manrope,sans-serif' }}
                      >
                        Alle gelesen
                      </button>
                    )}
                  </div>

                  {/* Liste */}
                  <div style={{ maxHeight:320, overflowY:'auto' }}>
                    {benachrichtigungen.length === 0 ? (
                      <div style={{ padding:'24px 16px', textAlign:'center', color:'#9ca3af', fontSize:13 }}>
                        Keine Benachrichtigungen
                      </div>
                    ) : (
                      benachrichtigungen.map(b => (
                        <div key={b.id} style={{
                          padding:'12px 16px',
                          borderBottom:'1px solid #f9fafb',
                          background: b.gelesen ? '#fff' : '#f0fdf4',
                          display:'flex', gap:10, alignItems:'flex-start'
                        }}>
                          <div style={{
                            width:34, height:34, borderRadius:'50%',
                            background:'#e8f5ee', flexShrink:0,
                            display:'flex', alignItems:'center', justifyContent:'center'
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize:16, color:'#0d631b' }}>
                              workspace_premium
                            </span>
                          </div>
                          <div style={{ flex:1 }}>
                            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, color:'#111827', marginBottom:2 }}>
                              {b.titel}
                            </p>
                            <p style={{ fontSize:11, color:'#6b7280', lineHeight:1.5 }}>
                              {b.nachricht}
                            </p>
                            <p style={{ fontSize:10, color:'#9ca3af', marginTop:4 }}>
                              {zeitFormatieren(b.created_at)}
                            </p>
                          </div>
                          {!b.gelesen && (
                            <div style={{ width:8, height:8, borderRadius:'50%', background:'#0d631b', flexShrink:0, marginTop:4 }} />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Profil-Avatar */}
          <div style={{ position:'relative' }}>
            <div
              style={{ width:34, height:34, borderRadius:'50%', background:'#e8f5ee', border:'2px solid #0d631b', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
              onClick={() => { setShowOverlay(v => !v); setShowBenachrichtigungen(false) }}
            >
              <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:11, color:'#0d631b' }}>
                {(profile.display_name || profile.name)?.split(' ').map((n:string) => n[0]).join('').slice(0,2).toUpperCase()}
              </span>
            </div>

            {/* Dropdown */}
            {showOverlay && (
              <>
                <div style={{ position:'fixed', inset:0, zIndex:90 }} onClick={() => setShowOverlay(false)} />
                <div style={{
                  position:'absolute', top:42, right:0, zIndex:100,
                  background:'#fff', borderRadius:16,
                  boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
                  border:'1px solid #f3f4f6',
                  minWidth:200, overflow:'hidden'
                }}>
                  <div style={{ padding:'16px', borderBottom:'1px solid #f3f4f6' }}>
                    <div style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:14, color:'#111827' }}>
                      {profile.display_name || profile.name || profile.email}
                    </div>
                    <div style={{ fontFamily:'Manrope,sans-serif', fontSize:12, color:'#9ca3af', marginTop:2 }}>
                      {profile.email}
                    </div>
                    <div style={{ marginTop:8, display:'inline-flex', alignItems:'center', gap:4, background:'#e8f5ee', borderRadius:20, padding:'3px 10px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:13, color:'#0d631b' }}>stars</span>
                      <span style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:12, color:'#0d631b' }}>
                        {profile.punkte} Punkte
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => { setActiveTab('profil'); setShowOverlay(false) }}
                    style={{
                      width:'100%', padding:'14px 16px',
                      border:'none', borderBottom:'1px solid #f3f4f6', background:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:10,
                      fontFamily:'Manrope,sans-serif', fontWeight:600, fontSize:14,
                      color:'#111827', textAlign:'left'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize:18, color:'#0d631b' }}>manage_accounts</span>
                    Konto bearbeiten
                  </button>

                  <button
                    onClick={handleLogout}
                    style={{
                      width:'100%', padding:'14px 16px',
                      border:'none', background:'none', cursor:'pointer',
                      display:'flex', alignItems:'center', gap:10,
                      fontFamily:'Manrope,sans-serif', fontWeight:600, fontSize:14,
                      color:'#ef4444', textAlign:'left'
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize:18 }}>logout</span>
                    Abmelden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Screen */}
      <main style={{ paddingBottom:80 }}>
        {activeTab === 'home'           && <Home           {...screenProps} />}
        {activeTab === 'marktplatz'     && <Marktplatz     {...screenProps} />}
        {activeTab === 'meineschichten' && <MeineSchichten {...screenProps} />}
        {activeTab === 'rangliste'      && <Rangliste      {...screenProps} />}
        {activeTab === 'shop'           && <Shop           {...screenProps} />}
        {activeTab === 'verwaltung' && profile.is_admin && <Verwaltung {...screenProps} />}
        {activeTab === 'profil' && (
          <Profil
            {...screenProps}
            onProfileUpdate={(updated) => setProfile(updated)}
          />
        )}
      </main>

      {/* Bottom Nav */}
      <nav style={{
        position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
        width:'100%', maxWidth:420,
        background:'rgba(255,255,255,.95)', backdropFilter:'blur(12px)',
        borderTop:'1px solid #f3f4f6',
        display:'flex', zIndex:100,
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        {tabs.map(t => (
          <button
            key={t.id}
            className={`nav-btn${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
            style={{ flex:1, padding:'10px 4px 8px', border:'none', background:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3, fontSize:9, fontFamily:'Lexend,sans-serif', fontWeight:800, textTransform:'uppercase', letterSpacing:'.04em' }}
          >
            <span className={`material-symbols-outlined${activeTab === t.id ? ' icon-fill' : ''}`} style={{ fontSize:20 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}