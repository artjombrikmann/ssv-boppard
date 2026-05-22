import { useState } from 'react'
import { supabase } from '../supabaseClient'

type Mode = 'login' | 'register' | 'reset' | 'datenschutz' | 'erfolg'

export default function Login() {
  const [mode, setMode]         = useState<Mode>('login')
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [freischaltcode, setFreischaltcode] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [message, setMessage]   = useState('')
  const [consentRangliste, setConsentRangliste]   = useState(false)
  const [consentDsgvo, setConsentDsgvo]           = useState(false)
  const [consentErinnerung, setConsentErinnerung] = useState(false)

  function validateEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) }
  function clearMessages() { setError(''); setMessage('') }

  async function handleLogin() {
    clearMessages()
    if (!email)                { setError('Bitte E-Mail eingeben.'); return }
    if (!validateEmail(email)) { setError('Bitte eine gültige E-Mail eingeben.'); return }
    if (!password)             { setError('Bitte Passwort eingeben.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('E-Mail oder Passwort falsch.')
    setLoading(false)
  }

  async function handleRegister() {
    clearMessages()
    if (!name.trim())                      { setError('Bitte Vor- und Nachname eingeben.'); return }
    if (name.trim().split(' ').length < 2) { setError('Bitte Vor- UND Nachname eingeben.'); return }
    if (!email)                            { setError('Bitte E-Mail eingeben.'); return }
    if (!validateEmail(email))             { setError('Bitte eine gültige E-Mail eingeben.'); return }
    if (!password)                         { setError('Bitte Passwort eingeben.'); return }
    if (password.length < 8)               { setError('Passwort muss mindestens 8 Zeichen haben.'); return }
    if (password !== password2)            { setError('Passwörter stimmen nicht überein.'); return }
    if (!freischaltcode.trim())            { setError('Bitte Freischaltcode eingeben.'); return }
    if (!consentRangliste)  { setError('Bitte der Ranglisten-Anzeige zustimmen.'); return }
    if (!consentDsgvo)      { setError('Bitte die Datenschutzerklärung akzeptieren.'); return }
    if (!consentErinnerung) { setError('Bitte den E-Mail-Erinnerungen zustimmen.'); return }

    setLoading(true)

    const { data: settings } = await supabase.from('einstellungen').select('freischaltcode').single()
    if (!settings || freischaltcode.trim() !== settings.freischaltcode) {
      setError('Ungültiger Freischaltcode. Bitte wende dich an deinen Admin.')
      setLoading(false); return
    }

    const { data: existingEmail } = await supabase.from('profiles').select('id').eq('email', email.trim().toLowerCase()).limit(1)
    if (existingEmail && existingEmail.length > 0) {
      setError('Diese E-Mail-Adresse ist bereits registriert.')
      setLoading(false); return
    }

    const { data: existingName } = await supabase.from('profiles').select('id').ilike('name', name.trim()).limit(1)
    if (existingName && existingName.length > 0) {
      setError('Ein Mitglied mit diesem Namen existiert bereits.')
      setLoading(false); return
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email, password,
      options: { data: { name: name.trim(), display_name: name.trim().split(' ')[0] } }
    })
    if (authError || !data.user) {
      setError(authError?.message ?? 'Fehler bei der Registrierung.')
      setLoading(false); return
    }
    setMode('erfolg')
    setLoading(false)
  }

  async function handleReset() {
    clearMessages()
    if (!email)                { setError('Bitte E-Mail eingeben.'); return }
    if (!validateEmail(email)) { setError('Bitte eine gültige E-Mail eingeben.'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email)
    if (error) setError(error.message)
    else setMessage('Reset-Link wurde gesendet! Bitte prüfe deine E-Mails.')
    setLoading(false)
  }

  const s = styles

  if (mode === 'datenschutz') return (
    <div style={s.wrap}>
      <div style={{ maxWidth:400, width:'100%' }}>
        <button onClick={() => setMode('register')} style={s.backBtn}>
          <span className="material-symbols-outlined" style={{ fontSize:18 }}>arrow_back</span>
          Zurück
        </button>
        <h1 style={{ ...s.headline, fontSize:22, marginBottom:20 }}>Datenschutzerklärung</h1>
        {[
          { title:'1. Verantwortlicher', text:'SSV Boppard 1920 e.V., Boppard am Rhein.' },
          { title:'2. Erhobene Daten', text:'Name, E-Mail, Punktestand, Schichthistorie und Einlösungsanfragen.' },
          { title:'3. Rangliste', text:'Dein Name und Punktestand sind in der vereinsinternen Rangliste sichtbar.' },
          { title:'4. E-Mail-Erinnerungen', text:'Wir senden Erinnerungen 5 und 2 Tage vor deiner Schicht.' },
          { title:'5. Deine Rechte', text:'Kontakt: info@ssv-boppard.de' },
        ].map(item => (
          <div key={item.title} style={s.dsCard}>
            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, marginBottom:6, color:'#61de8a' }}>{item.title}</p>
            <p style={{ fontSize:13, color:'rgba(229,226,225,0.6)', lineHeight:1.6 }}>{item.text}</p>
          </div>
        ))}
        <button style={s.btnPrimary} onClick={() => setMode('register')}>Verstanden – zurück</button>
      </div>
    </div>
  )

  if (mode === 'erfolg') return (
    <div style={{ ...s.wrap, textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'rgba(97,222,138,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', border:'2px solid #61de8a' }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:'#61de8a' }}>check_circle</span>
      </div>
      <h1 style={{ ...s.headline, fontSize:22, marginBottom:8 }}>Registrierung erfolgreich!</h1>
      <p style={{ color:'rgba(229,226,225,0.6)', fontSize:14, lineHeight:1.6, maxWidth:300, margin:'0 auto 24px' }}>
        Wir haben dir eine Bestätigungs-E-Mail gesendet. Bitte bestätige deine Adresse bevor du dich anmeldest.
      </p>
      <div style={{ background:'rgba(97,222,138,0.08)', border:'1px solid rgba(97,222,138,0.2)', borderRadius:10, padding:'10px 12px', maxWidth:320, margin:'0 auto 24px', display:'flex', alignItems:'flex-start', gap:8 }}>
        <span className="material-symbols-outlined" style={{ fontSize:16, color:'#61de8a' }}>info</span>
        <p style={{ fontSize:12, color:'#61de8a', fontWeight:500 }}>Sieh auch im Spam-Ordner nach.</p>
      </div>
      <button style={{ ...s.btnPrimary, maxWidth:280 }} onClick={() => setMode('login')}>Zur Anmeldung</button>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom: mode === 'login' ? 32 : 20 }}>
          <div style={{ width: mode === 'login' ? 96 : 64, height: mode === 'login' ? 96 : 64, borderRadius:'50%', background:'#0a1a0f', border:'2px solid rgba(97,222,138,0.3)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto', marginBottom:12, overflow:'hidden' }}>
            <img src="/LOGO-SSV-BOPPARD-_1_.png" alt="SSV Boppard" style={{ width:'88%', height:'88%', objectFit:'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<span style="font-family:Lexend,sans-serif;font-weight:900;color:#61de8a;font-size:18px">SSV</span>' }} />
          </div>
          <h1 style={s.headline}>SSV Boppard</h1>
          <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13, marginTop:4 }}>Schichtplaner 1920 e.V.</p>
        </div>

        <div style={s.card}>
          <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:18, marginBottom:20, color:'#e5e2e1' }}>
            {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Passwort zurücksetzen'}
          </h2>

          {error   && <div style={s.errorBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{error}</div>}
          {message && <div style={s.successBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>check_circle</span>{message}</div>}

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {mode === 'register' && (
              <Field label="Vor- und Nachname" icon="person"><input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Max Mustermann" /></Field>
            )}
            <Field label="E-Mail" icon="mail"><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="max@beispiel.de" /></Field>
            {mode !== 'reset' && (
              <Field label="Passwort" icon="lock">
                <div style={{ position:'relative' }}>
                  <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ paddingRight:40 }} />
                  <button onClick={() => setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'rgba(229,226,225,0.4)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </Field>
            )}
            {mode === 'register' && (
              <Field label="Passwort bestätigen" icon="lock">
                <input className="input" type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Passwort wiederholen" />
              </Field>
            )}
            {mode === 'register' && (
              <Field label="Freischaltcode" icon="key">
                <input className="input" type="text" value={freischaltcode} onChange={e => setFreischaltcode(e.target.value)} placeholder="Code von deinem Verein" />
              </Field>
            )}
            {mode === 'register' && (
              <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                <p style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.4)', textTransform:'uppercase', letterSpacing:'.06em' }}>Zustimmungen (alle Pflicht)</p>
                <ConsentBox checked={consentRangliste} onChange={setConsentRangliste} label="Rangliste & Punktestand" text="Ich stimme zu, dass mein Name und Punktestand in der vereinsinternen Rangliste sichtbar sind." />
                <ConsentBox checked={consentDsgvo} onChange={setConsentDsgvo} label="Datenschutzerklärung"
                  text={<>Ich habe die <button onClick={() => setMode('datenschutz')} style={{ color:'#61de8a', fontWeight:700, background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>Datenschutzerklärung</button> gelesen und stimme zu.</>} />
                <ConsentBox checked={consentErinnerung} onChange={setConsentErinnerung} label="E-Mail-Erinnerungen" text="Ich erhalte automatische Erinnerungen 5 und 2 Tage vor meiner Schicht." />
              </div>
            )}
          </div>

          <button style={{ ...s.btnPrimary, marginTop:20 }} onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleReset} disabled={loading}>
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Reset-Link senden'}
          </button>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, marginTop:14 }}>
            {mode === 'login' && <button style={s.linkBtn} onClick={() => { setMode('reset'); clearMessages() }}>Passwort vergessen?</button>}
            {mode !== 'login' && <button style={s.linkBtn} onClick={() => { setMode('login'); clearMessages() }}>← Zurück zur Anmeldung</button>}
          </div>
        </div>

        {mode === 'login' && (
          <div style={{ textAlign:'center', marginTop:20 }}>
            <p style={{ color:'rgba(229,226,225,0.4)', fontSize:13 }}>Noch kein Konto?</p>
            <button style={{ ...s.linkBtn, fontWeight:900, marginTop:4 }} onClick={() => { setMode('register'); clearMessages() }}>Jetzt registrieren →</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:10, fontWeight:800, color:'rgba(229,226,225,0.4)', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }}>{label}</label>
      <div style={{ position:'relative' }}>
        <span className="material-symbols-outlined" style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, color:'rgba(229,226,225,0.3)', pointerEvents:'none', zIndex:1 }}>{icon}</span>
        {children}
      </div>
    </div>
  )
}

function ConsentBox({ checked, onChange, label, text }: { checked: boolean; onChange: (v: boolean) => void; label: string; text: React.ReactNode }) {
  return (
    <label style={{ display:'flex', gap:12, cursor:'pointer', alignItems:'flex-start' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width:16, height:16, marginTop:2, accentColor:'#61de8a', flexShrink:0, cursor:'pointer' }} />
      <div>
        <p style={{ fontSize:12, fontWeight:700, color:'#e5e2e1' }}>{label} <span style={{ color:'#ef4444' }}>*</span></p>
        <p style={{ fontSize:11, color:'rgba(229,226,225,0.5)', marginTop:2, lineHeight:1.5 }}>{text}</p>
      </div>
    </label>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap:       { minHeight:'100vh', background:'#131313', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'20px 16px' },
  headline:   { fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:26, color:'#61de8a', textTransform:'uppercase', letterSpacing:'.08em' },
  card:       { background:'#1c1b1b', borderRadius:24, padding:24, width:'100%', boxShadow:'0 2px 32px rgba(0,0,0,0.4)', border:'1px solid rgba(255,255,255,0.06)' },
  btnPrimary: { width:'100%', padding:14, background:'#61de8a', color:'#00391a', border:'none', borderRadius:12, fontFamily:'Lexend,sans-serif', fontWeight:900, fontSize:14, cursor:'pointer' },
  linkBtn:    { background:'none', border:'none', color:'#61de8a', fontSize:13, fontWeight:700, cursor:'pointer' },
  errorBox:   { background:'rgba(239,68,68,0.1)', color:'#ef4444', borderRadius:10, padding:'10px 12px', fontSize:13, fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', gap:8, border:'1px solid rgba(239,68,68,0.2)' },
  successBox: { background:'rgba(97,222,138,0.08)', color:'#61de8a', borderRadius:10, padding:'10px 12px', fontSize:13, fontWeight:500, marginBottom:14, display:'flex', alignItems:'center', gap:8, border:'1px solid rgba(97,222,138,0.2)' },
  dsCard:     { background:'#2a2a2a', borderRadius:12, padding:14, marginBottom:10, border:'1px solid rgba(255,255,255,0.06)' },
  backBtn:    { display:'flex', alignItems:'center', gap:6, background:'none', border:'none', color:'rgba(229,226,225,0.5)', cursor:'pointer', fontSize:13, fontWeight:600, marginBottom:16, padding:0 },
}
