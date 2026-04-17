export interface Profile {
  id: string
  name: string
  email: string
  punkte: number
  schichten_count: number
  is_admin: boolean
  consent_rangliste: boolean
  consent_dsgvo: boolean
  consent_erinnerung: boolean
  datenschutz_akzeptiert: boolean
  nutzungsbedingungen_akzeptiert: boolean
  newsletter_akzeptiert: boolean
  einwilligung_datum: string | null
  created_at: string
  display_name: string
  is_temp?: boolean
  temp_typ?: string | null
}

export interface Veranstaltung {
  id: number
  name: string
  // typ entfernt – Spalte wurde aus DB gelöscht, Kategorie übernimmt das
  datum: string
  datum_ende?: string | null
  ort: string
  status: string
  kategorie: 'heimspiel' | 'vereinsfest' | 'flag-football' | 'turnier'
}

export interface Kategorie {
  id: string
  name: string
  farbe: string
  punkte: number
  schichten_count?: number
  created_at: string
}

export interface Schicht {
  id: number
  bezeichnung: string
  veranstaltung_id: number
  kategorie_id: string | null
  startzeit: string
  endzeit: string
  plaetze: number
  belegt: number
  punkte: number
  beschreibung: string
  veranstaltungen?: { name: string } // typ entfernt
  kategorien?: { name: string; farbe: string }
}

export interface Schichtbelegung {
  id: number
  schicht_id: number
  mitglied_id: string
  status: string
  punkte_vergeben: boolean
  created_at: string
  profiles?: { name: string }
  schichten?: {
    bezeichnung: string
    punkte: number
    startzeit: string
    endzeit: string
    veranstaltungen?: { name: string } // typ entfernt
    kategorien?: { name: string; farbe: string }
  }
}

export interface ShopArtikel {
  id: string
  name: string
  beschreibung: string
  punkte_kosten: number
  bild_url?: string
  verfuegbar: boolean
  created_at: string
}

export interface ShopAnfrage {
  id: string
  user_id: string
  preis_id: string
  preis_name: string
  punkte_kosten: number
  status: 'offen' | 'bearbeitet' | 'abgelehnt'
  notiz?: string
  created_at: string
  profiles?: { name: string; email: string }
  preise?: { name: string }
}

export interface Punkteregel {
  id: string
  bezeichnung: string
  punkte: number
  kategorie_id: string | null
  aktiv: boolean
  created_at: string
  kategorien?: { name: string }
}

export interface Einstellungen {
  id: number
  punkte_kurz: number
  punkte_normal: number
  punkte_lang: number
  punkte_sonder: number
  bonus_turnier: number
  bonus_fest: number
  admin_email: string
}

export interface GutscheinAnfrage {
  id: number
  mitglied_id: string
  typ: string
  punkte: number
  status: string
  created_at: string
  profiles?: { name: string }
}