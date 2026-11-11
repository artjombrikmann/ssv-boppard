import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useVerein } from '../VereinContext'
import { Field, ConsentBox, VereinKopf, authStyles as s } from '../components/AuthBausteine'
import Datenschutz from './Datenschutz'

interface Props {
  /** Wird nach erfolgreichem Beitritt aufgerufen (App lädt die Mitgliedschaft neu) */
  onBeigetreten: () => Promise<void>
  onLogout: () => void
  /** Hinweis aus dem automatischen Beitritt (z. B. falscher Code) */
  hinweis?: string
}

// Konto ist angemeldet, aber (noch) nicht Mitglied dieses Vereins.
export default function Beitreten({ onBeigetreten, onLogout, hinweis }: Props) {
  const verein = useVerein()
  const [code, setCode]       = useState('')
  const [rangliste, setRangliste]   = useState(false)
  const [dsgvo, setDsgvo]           = useState(false)
  const [erinnerung, setErinnerung] = useState(false)
  const [zeigeDatenschutz, setZeigeDatenschutz] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (zeigeDatenschutz) return <Datenschutz onBack={() => setZeigeDatenschutz(false)} />

  async function beitreten() {
    setError('')
    if (!code.trim())  { setError('Bitte Freischaltcode eingeben.'); return }
    if (!rangliste)    { setError('⚠️ Bitte der Ranglisten-Anzeige zustimmen.'); return }
    if (!dsgvo)        { setError('⚠️ Bitte die Datenschutzerklärung akzeptieren.'); return }
    if (!erinnerung)   { setError('⚠️ Bitte den E-Mail-Erinnerungen zustimmen.'); return }

    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('verein_beitreten', {
      p_slug: verein.slug,
      p_code: code.trim(),
      p_consents: { rangliste, datenschutz: dsgvo, erinnerung },
    })
    setLoading(false)

    if (rpcError) { setError('Der Beitritt hat nicht geklappt. Bitte versuche es später noch einmal.'); return }
    if (data === 'falscher_code') { setError('❌ Ungültiger Freischaltcode. Bitte wende dich an deinen Admin.'); return }
    if (data === 'gesperrt')      { setError('Zu viele Fehlversuche. Bitte warte eine Stunde und versuche es dann erneut.'); return }
    // 'ok' und 'bereits_mitglied' führen beide in die App
    await onBeigetreten()
  }

  return (
    <div style={s.wrap}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <VereinKopf logoUrl={verein.logo_url} name={verein.name} untertitel="Schichtplaner" gross={false} />

        <div style={s.card}>
          <h2 style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:18, marginBottom:6, color:'#191c1b' }}>
            Diesem Verein beitreten
          </h2>
          <p style={{ fontSize:13, color:'#5d5e61', lineHeight:1.5, marginBottom:16 }}>
            Du bist angemeldet, aber noch nicht Mitglied bei {verein.name}. Gib den Freischaltcode deines Vereins ein.
            Dein Konto und dein Passwort bleiben dieselben.
          </p>

          {hinweis && <div style={s.errorBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{hinweis}</div>}
          {error   && <div style={s.errorBox}><span className="material-symbols-outlined" style={{ fontSize:16 }}>error</span>{error}</div>}

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Field label="Freischaltcode" icon="key">
              <input className="input" type="text" value={code} onChange={e => setCode(e.target.value)} placeholder="Code von deinem Verein" style={s.inputStyle} />
            </Field>

            <div style={{ borderTop:'1px solid #f3f4f6', paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
              <p style={{ fontSize:10, fontWeight:800, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'.06em' }}>Zustimmungen (alle Pflicht)</p>
              <ConsentBox checked={rangliste} onChange={setRangliste} label="Rangliste & Punktestand"
                text={`Ich stimme zu, dass mein Name und Punktestand in der Rangliste von ${verein.name} sichtbar sind.`} />
              <ConsentBox checked={dsgvo} onChange={setDsgvo} label="Datenschutzerklärung"
                text={<>Ich habe die <button onClick={() => setZeigeDatenschutz(true)} style={{ color:'var(--primary)', fontWeight:700, background:'none', border:'none', cursor:'pointer', textDecoration:'underline', fontSize:11 }}>Datenschutzerklärung</button> gelesen und stimme zu.</>} />
              <ConsentBox checked={erinnerung} onChange={setErinnerung} label="E-Mail-Erinnerungen"
                text="Ich erhalte automatische Erinnerungen 5 und 2 Tage vor meiner Schicht." />
            </div>
          </div>

          <button style={{ ...s.btnPrimary, marginTop:20 }} onClick={beitreten} disabled={loading}>
            {loading ? 'Bitte warten...' : 'Beitreten'}
          </button>
          <div style={{ display:'flex', justifyContent:'center', marginTop:14 }}>
            <button style={s.linkBtn} onClick={onLogout}>Abmelden</button>
          </div>
        </div>
      </div>
    </div>
  )
}
