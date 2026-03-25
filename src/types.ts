export interface Profile {
  id: string;
  name: string;
  email: string;
  punkte: number;
  schichten_count: number;
  is_admin: boolean;
  created_at: string;
}

export interface Veranstaltung {
  id: number;
  name: string;
  typ: string;
  datum: string;
  ort: string;
  status: string;
}

export interface Schicht {
  id: number;
  bezeichnung: string;
  veranstaltung_id: number;
  startzeit: string;
  endzeit: string;
  plaetze: number;
  belegt: number;
  punkte: number;
  beschreibung: string;
  veranstaltungen?: { name: string; typ: string };
}

export interface Schichtbelegung {
  id: number;
  schicht_id: number;
  mitglied_id: string;
  status: string;
  punkte_vergeben: boolean;
  created_at: string;
  profiles?: { name: string };
  schichten?: {
    bezeichnung: string;
    punkte: number;
    veranstaltungen?: { name: string };
  };
}

export interface Einstellungen {
  id: number;
  food_pts: number;
  food_val: number;
  shop_pts: number;
  shop_val: number;
}

export interface GutscheinAnfrage {
  id: number;
  mitglied_id: string;
  typ: string;
  punkte: number;
  status: string;
  created_at: string;
  profiles?: { name: string };
}
