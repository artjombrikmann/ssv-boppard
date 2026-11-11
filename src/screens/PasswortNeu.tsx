import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useVerein } from '../VereinContext'
import { Field, VereinKopf, authStyles as s } from '../components/AuthBausteine'

// Seite für den Link aus der Reset-Mail (/passwort-neu).
// Supabase hängt Token an die Adresse und löst PASSWORD_RECOVERY aus; die Sitzung gilt
// nur zum Setzen des Passworts. Danach melden wir ab und führen zum Login.
export default function PasswortNeu() {
  const verein = useVerein()
  const [bereit, setBereit]       = useState(false)
  const [abgelaufen, setAbgelaufen] = useState(false)
  const [pw, setPw]               = useState('')
  const [pw2, setPw2]             = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [fertig, setFertig]       = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setBereit(true)
    })
    // Fehler im Link (abgelaufen, schon benutzt) stehen im Adress-Fragment: #error=...&error_code=otp_expired
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    if (hash.get('error') || hash.get('error_code')) setAbgelaufen(true)
    // Falls das Ereignis schon vor dem Abonnieren kam: vorhandene Sitzung prüfen
    supabase.auth.getSession().then(({ data }) => { if (data.session) setBereit(true) })
    return () => { subscription.unsubscribe() }
  }, [])

  async function speichern() {
    setError('')
    if (pw.length < 8)  { setError('Das Passwort muss mindestens 8 Zeichen haben.'); return }
    if (pw !== pw2)     { setError('Die Passwörter stimmen nicht überein.'); return }
    setLoading(true)
    const { error: updError } = await supabase.auth.updateUser({ password: pw })
    if (updError) {
      setError(/same|different/i.test(updError.message)
        ? 'Bitte wähle ein anderes Passwort als bisher.'
        : 'Das Passwort konnte nicht gespeichert werden. Der Link ist vielleicht abgelaufen. Fordere einen neuen an.')
      setLoading(false)
      return
    }
    // Sitzung beenden: Nach dem Zurücksetzen soll man sich bewusst neu anmelden
    await supabase.auth.signOut()
    setLoading(false)
    setFertig(true)
  }

  function zumLogin() {
    window.location.replace('/')
  }

  if (fertig) return (
    <div style={{ ...s.wrap, textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--primary-light)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:'var(--primary)' }}>check_circle</span>
      </div>
      <h1 style={{ ...s.headline, fontSize:22, marginBottom:8 }}>Passwort geändert</h1>
      <p style={{ color:'#5d5e61', fontSize:14, lineHeight:1.6, maxWidth:300, margin:'0 auto 24px' }}>
        Du kannst dich jetzt mit dem neuen Passwort anmelden. Es gilt für alle Vereine, bei denen du Mitglied bist.
      </p>
      <button style={{ ...s.btnPrimary, maxWidth:280 }} onClick={zumLogin}>Zur Anmeldung</button>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <VereinKopf logoUrl={verein.logo_url} name={verein.name} untertitel="Schichtplaner" gross={false} />

        <div style={s.card}>
          <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:18, marginBottom:20, color:'#191c1b' }}>Neues Passwort festlegen</h2>

          {!bereit && (
            <div style={s.errorBox}>
              <span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>
              <span>
                {abgelaufen
                  ? 'Dieser Link ist abgelaufen oder wurde schon benutzt. Fordere auf der Anmeldeseite einen neuen an.'
                  : 'Der Link wird geprüft. Öffne diese Seite über den Link aus der E-Mail. Passiert nichts, fordere einen neuen Link an.'}
              </span>
            </div>
          )}

          {error && <div style={s.errorBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{error}</div>}

          {bereit && (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <Field label="Neues Passwort" icon="lock">
                  <div style={{ position:'relative' }}>
                    <input className="input" type={showPw ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} placeholder="Mindestens 8 Zeichen" style={{ ...s.inputStyle, paddingRight:40 }} />
                    <button onClick={() => setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}>
                      <span className="material-symbols-outlined" style={{ fontSize:18 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                    </button>
                  </div>
                </Field>
                <Field label="Passwort wiederholen" icon="lock">
                  <input className="input" type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Passwort wiederholen" style={s.inputStyle} />
                </Field>
              </div>
              <div style={{ ...s.infoBox, marginTop:16 }}>
                <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--primary)' }}>info</span>
                <p style={{ fontSize:12, color:'var(--primary)', fontWeight:500 }}>Dein Passwort gilt für alle Vereine, bei denen du Mitglied bist.</p>
              </div>
              <button style={{ ...s.btnPrimary, marginTop:20 }} onClick={speichern} disabled={loading}>
                {loading ? 'Bitte warten...' : 'Passwort speichern'}
              </button>
            </>
          )}

          <div style={{ display:'flex', justifyContent:'center', marginTop:14 }}>
            <button style={s.linkBtn} onClick={zumLogin}>← Zur Anmeldung</button>
          </div>
        </div>
      </div>
    </div>
  )
}
