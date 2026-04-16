export interface Profile {
  id: string
  name: string
  email: string
  punkte: number
  schichten_count: number
  is_admin: boolean
  // Datenschutz-Zustimmungen (bei Registrierung)
  consent_rangliste: boolean
  consent_dsgvo: boolean
  consent_erinnerung: boolean
  // Neu: Datenschutz aus Supabase-Umbau
  datenschutz_akzeptiert: boolean
  nutzungsbedingungen_akzeptiert: boolean
  newsletter_akzeptiert: boolean
  einwilligung_datum: string | null
  created_at: string
   display_name: string;
}

export interface Veranstaltung {
  id: number
  name: string
  typ: string
  datum: string
  datum_ende?: string | null 
  ort: string
  status: string
  kategorie: 'heimspiel' | 'vereinsfest' | 'flag-football' | 'turnier'; 
}

export interface Kategorie {
  id: string          // ← UUID (war number)
  name: string
  farbe: string       // Neu: Hex-Farbe für UI
  punkte: number      // Neu: Standard-Punkte pro Schicht
  schichten_count?: number
  created_at: string
}

export interface Schicht {
  id: number
  bezeichnung: string
  veranstaltung_id: number
  kategorie_id: string | null   // ← UUID (war number)
  startzeit: string
  endzeit: string
  plaetze: number
  belegt: number
  punkte: number
  beschreibung: string
  veranstaltungen?: { name: string; typ: string }
  kategorien?: { name: string; farbe: string }  // Neu: farbe
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
    veranstaltungen?: { name: string }
    kategorien?: { name: string; farbe: string }  // Neu
  }
}

export interface ShopArtikel {
  id: string          // ← UUID (war number)
  name: string
  beschreibung: string
  punkte_kosten: number   // ← umbenannt von punkte (passt zur DB-Spalte)
  bild_url?: string       // Neu: optional
  verfuegbar: boolean     // ← umbenannt von aktiv (passt zur DB-Spalte)
  created_at: string
}

export interface ShopAnfrage {
  id: string          // ← UUID (war number)
  user_id: string     // ← umbenannt von mitglied_id (passt zur DB-Spalte)
  preis_id: string    // ← umbenannt von artikel_id
  preis_name: string  // Neu: Snapshot des Namens
  punkte_kosten: number
  status: 'offen' | 'bearbeitet' | 'abgelehnt'
  notiz?: string      // Neu: Admin-Notiz
  created_at: string
  profiles?: { name: string; email: string }
  preise?: { name: string }   // ← umbenannt von shop_artikel
}

export interface Punkteregel {
  id: string          // UUID
  bezeichnung: string
  punkte: number      // positiv = Bonus, negativ = Abzug
  kategorie_id: string | null
  aktiv: boolean
  created_at: string
  kategorien?: { name: string }
}

export interface Einstellungen {
  id: number
  // Punkteregeln
  punkte_kurz: number    // < 3h
  punkte_normal: number  // 3-6h
  punkte_lang: number    // > 6h
  punkte_sonder: number  // Sondereinsatz
  bonus_turnier: number  // Bonus bei Fußball-Turnier
  bonus_fest: number     // Bonus bei Vereinsfest
  // Shop
  admin_email: string    // E-Mail für Einlösungsbenachrichtigungen
}

// GutscheinAnfrage bleibt für Rückwärtskompatibilität erhalten
export interface GutscheinAnfrage {
  id: number
  mitglied_id: string
  typ: string
  punkte: number
  status: string
  created_at: string
  profiles?: { name: string }
}