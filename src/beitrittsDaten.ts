// Merkt sich Freischaltcode und Einwilligungen, wenn jemand sich mit einer bereits
// registrierten E-Mail anmelden muss (Konto aus einem anderen Verein). Nach dem Login
// tritt die App damit automatisch dem Verein bei.
//
// Bewusst NUR im Arbeitsspeicher (kein localStorage): Der Freischaltcode soll nicht
// auf dem Gerät liegen bleiben. Ein Neuladen der Seite verwirft ihn, dann erscheint
// der Beitreten-Screen mit manueller Eingabe.

export interface OffenerBeitritt {
  slug: string
  email: string
  code: string
  consents: { rangliste: boolean; datenschutz: boolean; erinnerung: boolean }
}

let offen: OffenerBeitritt | null = null

export function beitrittMerken(b: OffenerBeitritt) {
  offen = { ...b, email: b.email.trim().toLowerCase() }
}

/** Gibt die gemerkten Daten genau einmal zurück, nur wenn Verein und E-Mail passen. */
export function beitrittNehmen(slug: string, email: string | null | undefined): OffenerBeitritt | null {
  const b = offen
  offen = null
  if (!b || b.slug !== slug || b.email !== (email ?? '').trim().toLowerCase()) return null
  return b
}
