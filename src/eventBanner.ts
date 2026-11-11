import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import type { EventTyp } from './types'

// Darstellung der Event-Typen (Banner im Marktplatz, Auswahllisten in der Verwaltung).
// Die Typen kommen pro Verein aus der Tabelle event_typen (siehe sql/04b, 04i).
//
// STANDARD_TYPEN sind die bisherigen Werte von Boppard. Sie dienen als Rückfall, falls
// die Datenbank (noch) keinen Typ liefert oder Spalten fehlen. So sieht Boppard in jedem
// Fall wie bisher aus.

export interface TypAnzeige {
  key: string
  label: string
  icon: string
  gradient: string
  deko: boolean
}

const STANDARD_TYPEN: TypAnzeige[] = [
  { key: 'heimspiel',     label: 'Heimspiel',     icon: '⚽', deko: false, gradient: 'linear-gradient(135deg, #1a7a1a 0%, #2ecc40 60%, #145214 100%)' },
  { key: 'vereinsfest',   label: 'Vereinsfest',   icon: '🎪', deko: true,  gradient: 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 40%, #b8860b 100%)' },
  { key: 'flag-football', label: 'Flag-Football', icon: '🏈', deko: false, gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
  { key: 'turnier',       label: 'Turnier',       icon: '🏆', deko: false, gradient: 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 50%, #145214 100%)' },
]

const HEX = /^#[0-9a-f]{6}$/i
// Gleiche Regel wie die Datenbank (sql/04i): nur linear-gradient mit einfachen Werten.
// Der Wert landet im style-Attribut, deshalb wird er auch hier geprüft.
const VERLAUF = /^linear-gradient\((?:[#0-9a-zA-Z%,. -]|var\(--[a-z-]+\))+\)$/

/** Verlauf aus einer Farbe bauen (für Typen ohne eigenen Verlauf). */
function verlaufAusFarbe(farbe: string | null): string {
  const f = farbe && HEX.test(farbe) ? farbe : null
  if (!f) return 'linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)'
  return `linear-gradient(135deg, ${f} 0%, color-mix(in srgb, ${f} 70%, black) 100%)`
}

function ausDatenbank(t: EventTyp): TypAnzeige {
  const standard = STANDARD_TYPEN.find(s => s.key === t.key)
  const verlaufOk = t.verlauf && t.verlauf.length <= 200 && VERLAUF.test(t.verlauf)
  return {
    key: t.key,
    label: t.label,
    icon: t.icon || standard?.icon || '📅',
    deko: t.deko ?? standard?.deko ?? false,
    gradient: verlaufOk ? (t.verlauf as string) : verlaufAusFarbe(t.farbe),
  }
}

/** Sortierte Anzeigedaten. Ohne Datenbankeinträge gelten die Standardtypen von Boppard. */
export function typenAnzeige(typen: EventTyp[] | null | undefined): TypAnzeige[] {
  if (!typen || typen.length === 0) return STANDARD_TYPEN
  return [...typen].sort((a, b) => a.sort - b.sort).map(ausDatenbank)
}

/** Anzeige eines Typs. Unbekannter oder fehlender Schlüssel: erster Typ der Liste (bisher "Heimspiel"). */
export function getBanner(typen: TypAnzeige[], key?: string | null): TypAnzeige {
  return typen.find(t => t.key === key) ?? typen[0] ?? STANDARD_TYPEN[0]
}

/** Lädt die Event-Typen des Vereins. Bei Fehlern bleibt es bei den Standardtypen. */
export function useEventTypen(vereinId: string | undefined): TypAnzeige[] {
  const [typen, setTypen] = useState<TypAnzeige[]>(STANDARD_TYPEN)

  useEffect(() => {
    if (!vereinId) return
    let aktiv = true
    supabase
      .from('event_typen')
      .select('*')
      .eq('verein_id', vereinId)
      .order('sort')
      .then(({ data, error }) => {
        if (!aktiv) return
        if (error) { console.warn('event_typen nicht geladen, Standardwerte aktiv:', error.message); return }
        setTypen(typenAnzeige(data as EventTyp[]))
      })
    return () => { aktiv = false }
  }, [vereinId])

  return typen
}
