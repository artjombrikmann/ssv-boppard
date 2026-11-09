import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useVerein } from '../VereinContext'
import { beitrittMerken } from '../beitrittsDaten'
import { Field, ConsentBox, VereinKopf, authStyles as s } from '../components/AuthBausteine'
import Datenschutz from './Datenschutz'

type Mode = 'login' | 'register' | 'reset' | 'datenschutz' | 'erfolg'

export default function Login() {
  const verein = useVerein()
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

  function validateEmail(e: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  }

  function clearMessages() { setError(''); setMessage('') }

  async function handleLogin() {
    clearMessages()
    if (!email)                { setError('Bitte E-Mail eingeben.'); return }
    if (!validateEmail(email)) { setError('Bitte eine gültige E-Mail eingeben (z.B. max@beispiel.de).'); return }
    if (!password)             { setError('Bitte Passwort eingeben.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      // Nicht bestätigte Adresse bekommt eine eigene, verständliche Meldung
      setError(error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)
        ? 'Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Link geschickt (auch im Spam-Ordner nachsehen).'
        : 'E-Mail oder Passwort falsch.')
    }
    setLoading(false)
  }

  // Die E-Mail gehört schon zu einem Konto (vermutlich aus einem anderen Verein).
  // Das bestehende Konto bleibt unverändert, das eben eingegebene Passwort wird verworfen.
  // Code und Einwilligungen bleiben nur im Arbeitsspeicher, damit der Beitritt nach dem Login automatisch läuft.
  function aufBekanntesKontoUmleiten() {
    beitrittMerken({
      slug: verein.slug,
      email,
      code: freischaltcode.trim(),
      consents: { rangliste: consentRangliste, datenschutz: consentDsgvo, erinnerung: consentErinnerung },
    })
    setPassword('')
    setPassword2('')
    setMode('login')
    setError('')
    setMessage(`Diese E-Mail ist schon registriert, vielleicht in einem anderen Verein. Dein Passwort gilt für alle Vereine. Melde dich mit deinem bisherigen Passwort an, du wirst dann automatisch bei ${verein.name} aufgenommen. Passwort vergessen? Nutze den Link unten.`)
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
    if (!consentRangliste)  { setError('⚠️ Bitte der Ranglisten-Anzeige zustimmen.'); return }
    if (!consentDsgvo)      { setError('⚠️ Bitte die Datenschutzerklärung akzeptieren.'); return }
    if (!consentErinnerung) { setError('⚠️ Bitte den E-Mail-Erinnerungen zustimmen.'); return }

    setLoading(true)

    const vorname  = name.trim().split(' ')[0]
    const fullName = name.trim()

    // Der Freischaltcode wird serverseitig geprüft (handle_new_user), nicht mehr im Browser.
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Der Bestätigungslink soll auf diese Seite zurückführen (nicht immer auf die Site URL).
        // Erlaubt sind nur Adressen aus "Redirect URLs" in Supabase, alle anderen fallen auf die Site URL zurück.
        emailRedirectTo: window.location.origin,
        data: {
          name: fullName,
          display_name: vorname,
          verein_slug: verein.slug,
          freischaltcode: freischaltcode.trim(),
          consents: { rangliste: consentRangliste, datenschutz: consentDsgvo, erinnerung: consentErinnerung },
        },
      },
    })

    if (authError) {
      if (/already registered|already been registered/i.test(authError.message) || authError.code === 'user_already_exists') {
        aufBekanntesKontoUmleiten()
      } else if (/Freischaltcode/i.test(authError.message)) {
        setError('❌ Ungültiger Freischaltcode. Bitte wende dich an deinen Admin.')
      } else if (/Database error saving new user/i.test(authError.message)) {
        // Die Datenbank hat die Registrierung abgelehnt (Details stehen nur im Server-Log)
        setError('Die Registrierung wurde abgelehnt. Bitte prüfe den Freischaltcode oder wende dich an deinen Admin.')
      } else {
        setError(authError.message)
      }
      setLoading(false)
      return
    }

    // Bei aktiver E-Mail-Bestätigung liefert Supabase für eine bekannte Adresse KEINEN Fehler,
    // sondern einen Benutzer mit leerer identities-Liste.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      aufBekanntesKontoUmleiten()
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('Fehler bei der Registrierung.')
      setLoading(false)
      return
    }

    setMode('erfolg')
    setLoading(false)
  }

  async function handleReset() {
    clearMessages()
    if (!email)                { setError('Bitte E-Mail eingeben.'); return }
    if (!validateEmail(email)) { setError('Bitte eine gültige E-Mail eingeben.'); return }
    setLoading(true)
    // Die Function antwortet immer gleich, egal ob es die Adresse gibt. Deshalb zeigen wir auch
    // immer dieselbe Meldung. Den Rücksprung-Link baut der Server aus dem Vereins-Slug.
    const { error } = await supabase.functions.invoke('passwort-reset', {
      body: { email: email.trim(), verein_slug: verein.slug },
    })
    if (error) setError('Die Anfrage konnte nicht gesendet werden. Bitte versuche es später noch einmal.')
    else setMessage('Wenn es zu dieser Adresse ein Konto gibt, haben wir dir einen Link zum Zurücksetzen geschickt. Bitte prüfe auch den Spam-Ordner.')
    setLoading(false)
  }

  if (mode === 'datenschutz') {
    return <Datenschutz onBack={() => setMode('register')} buttonLabel="Verstanden – zurück zur Registrierung" />
  }

  // ── Erfolg Screen ──
  if (mode === 'erfolg') return (
    <div style={{ ...s.wrap, textAlign:'center' }}>
      <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--primary-light)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
        <span className="material-symbols-outlined icon-fill" style={{ fontSize:40, color:'var(--primary)' }}>check_circle</span>
      </div>
      <h1 style={{ ...s.headline, fontSize:22, marginBottom:8 }}>Registrierung erfolgreich!</h1>
      <p style={{ color:'#5d5e61', fontSize:14, lineHeight:1.6, maxWidth:300, margin:'0 auto 24px' }}>
        Wir haben dir eine Bestätigungs-E-Mail gesendet. Bitte bestätige deine Adresse bevor du dich anmeldest.
      </p>
      <div style={{ ...s.infoBox, maxWidth:320, margin:'0 auto 24px' }}>
        <span className="material-symbols-outlined" style={{ fontSize:16, color:'var(--primary)' }}>info</span>
        <p style={{ fontSize:12, color:'var(--primary)', fontWeight:500 }}>Sieh auch im Spam-Ordner nach falls du keine E-Mail erhalten hast.</p>
      </div>
      <button style={{ ...s.btnPrimary, maxWidth:280 }} onClick={() => setMode('login')}>
        Zur Anmeldung
      </button>
    </div>
  )

  return (
    <div style={s.wrap}>
      <div style={{ width:'100%', maxWidth:380 }}>

        <VereinKopf logoUrl={verein.logo_url} name={verein.name} untertitel="Schichtplaner" gross={mode === 'login'} />

        {/* Card */}
        <div style={s.card}>
          <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:18, marginBottom:20, color:'#191c1b' }}>
            {mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Passwort zurücksetzen'}
          </h2>

          {error   && <div style={s.errorBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{error}</div>}
          {message && <div style={s.successBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>check_circle</span>{message}</div>}

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {mode === 'register' && (
              <Field label="Vor- und Nachname" icon="person">
                <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Max Mustermann" style={s.inputStyle} />
              </Field>
            )}

            <Field label="E-Mail" icon="mail">
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="max@beispiel.de" style={s.inputStyle} />
            </Field>

            {mode !== 'reset' && (
              <Field label="Passwort" icon="lock">
                <div style={{ position:'relative' }}>
                  <input className="input" type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={{ ...s.inputStyle, paddingRight:40 }} />
                  <button onClick={() => setShowPw(!showPw)} style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'#9ca3af' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:18 }}>{showPw ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </Field>
            )}

            {mode === 'register' && (
              <Field label="Passwort bestätigen" icon="lock">
                <input className="input" type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Passwort wiederholen" style={s.inputStyle} />
              </Field>
            )}

            {/* Freischaltcode */}
            {mode === 'register' && (
              <Field label="Freischaltcode" icon="key">
                <input className="input" type="text" value={freischaltcode} onChange={e => setFreischaltcode(e.target.value)} placeholder="Code von deinem Verein" style={s.inputStyle} />
              </Field>
            )}

            {mode === 'register' && (
              <div style={{ borderTop:'1px solid #f3f4f6', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                <p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>Zustimmungen (alle Pflicht)</p>

                <ConsentBox checked={consentRangliste} onChange={setConsentRangliste}
                  label="Rangliste & Punktestand"
                  text="Ich stimme zu, dass mein Name und Punktestand in der vereinsinternen Rangliste sichtbar sind." />

                <ConsentBox checked={consentDsgvo} onChange={setConsentDsgvo}
                  label="Datenschutzerklärung"
                  text={<>Ich habe die <button onClick={() => setMode('datenschutz')} style={{ color:'var(--primary)', fontWeight:700, background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>Datenschutzerklärung</button> gelesen und stimme zu.</>} />

                <ConsentBox checked={consentErinnerung} onChange={setConsentErinnerung}
                  label="E-Mail-Erinnerungen"
                  text="Ich erhalte automatische Erinnerungen 5 und 2 Tage vor meiner Schicht." />
              </div>
            )}
          </div>

          <button style={{ ...s.btnPrimary, marginTop:20 }} onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleReset} disabled={loading}>
            {loading ? 'Bitte warten...' : mode === 'login' ? 'Anmelden' : mode === 'register' ? 'Konto erstellen' : 'Reset-Link senden'}
          </button>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, marginTop:14 }}>
            {mode === 'login' && (
              <button style={s.linkBtn} onClick={() => { setMode('reset'); clearMessages() }}>Passwort vergessen?</button>
            )}
            {mode !== 'login' && (
              <button style={s.linkBtn} onClick={() => { setMode('login'); clearMessages() }}>← Zurück zur Anmeldung</button>
            )}
          </div>
        </div>

        {mode === 'login' && (
          <div style={{ textAlign:'center', marginTop:20 }}>
            <p style={{ color:'#5d5e61', fontSize:13 }}>Noch kein Konto?</p>
            <button style={{ ...s.linkBtn, fontWeight:900, marginTop:4 }} onClick={() => { setMode('register'); clearMessages() }}>
              Jetzt registrieren →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
