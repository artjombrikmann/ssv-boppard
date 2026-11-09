import { useVerein } from '../VereinContext'
import { PLATTFORM } from '../config'
import { authStyles as s } from '../components/AuthBausteine'

interface Props { onBack: () => void; buttonLabel?: string }

// Datenschutzerklärung als generischer Baustein. Verantwortlicher, Anschrift, Kontakt und
// Vertretung kommen aus den Vereinsdaten (Tabelle vereine), der Betreiber der Plattform
// aus src/config.ts. Der Wortlaut übernimmt den bisherigen Text von Boppard.
// Rechtlich bitte vor dem Einsatz bei weiteren Vereinen prüfen.
export default function Datenschutz({ onBack, buttonLabel }: Props) {
  const v = useVerein()

  const name    = v.rechtsname || v.name
  const adresse = [v.anschrift, v.plz_ort].filter(Boolean).join(', ')
  const verantwortlicher = [
    name,
    adresse || null,
    v.land && v.land !== 'Deutschland' ? v.land : null,
  ].filter(Boolean).join(', ')
  const vertreten = v.vertretung ? ` Vertreten durch: ${v.vertretung}.` : ''
  const kontakt   = v.kontakt_email ? ` Kontakt: ${v.kontakt_email}` : ''

  const items: { title: string; text: string }[] = [
    { title: '1. Verantwortlicher',
      text: `${verantwortlicher}.${vertreten} Der Schichtplaner wird ausschließlich für vereinsinterne Zwecke genutzt.${kontakt}` },
    { title: '2. Erhobene Daten',
      text: 'Wir speichern: Name, E-Mail, Punktestand, Schichthistorie und Einlösungsanfragen. Diese Daten werden ausschließlich vereinsintern verwendet.' },
    { title: '3. Rangliste & Punktestand',
      text: 'Dein Name und dein Punktestand sind in der vereinsinternen Rangliste für eingeloggte Mitglieder deines Vereins sichtbar.' },
    { title: '4. E-Mail-Erinnerungen',
      text: 'Wir senden automatische Erinnerungen 5 und 2 Tage vor deiner Schicht. Diese sind für den Betrieb der App erforderlich.' },
    { title: '5. Deine Rechte',
      text: `Du hast das Recht auf Auskunft, Berichtigung und Löschung.${v.kontakt_email ? ` Kontakt: ${v.kontakt_email}` : ' Wende dich dazu an deinen Verein.'}` },
  ]

  if (PLATTFORM.betreiber) {
    const pAdresse = [PLATTFORM.anschrift, PLATTFORM.plzOrt].filter(Boolean).join(', ')
    items.push({
      title: '6. Technischer Betrieb',
      text: `Die App ${PLATTFORM.name} wird technisch betrieben von ${[PLATTFORM.betreiber, pAdresse].filter(Boolean).join(', ')}.${PLATTFORM.kontaktEmail ? ` Kontakt: ${PLATTFORM.kontaktEmail}` : ''}`,
    })
  }

  return (
    <div style={s.wrap}>
      <div style={{ maxWidth:400, width:'100%' }}>
        <button onClick={onBack} style={s.backBtn}>
          <span className="material-symbols-outlined" style={{ fontSize:16 }}>arrow_back</span>
          Zurück
        </button>
        <h1 style={{ ...s.headline, fontSize:22, marginBottom:20 }}>Datenschutzerklärung</h1>
        {items.map(item => (
          <div key={item.title} style={s.dsCard}>
            <p style={{ fontFamily:'Lexend,sans-serif', fontWeight:700, fontSize:13, marginBottom:6 }}>{item.title}</p>
            <p style={{ fontSize:13, color:'#5d5e61', lineHeight:1.6 }}>{item.text}</p>
          </div>
        ))}
        <button style={s.btnPrimary} onClick={onBack}>{buttonLabel ?? 'Verstanden – zurück'}</button>
      </div>
    </div>
  )
}
