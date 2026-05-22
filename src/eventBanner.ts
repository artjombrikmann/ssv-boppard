export type Kategorie = 'heimspiel' | 'vereinsfest' | 'flag-football' | 'turnier';

export const eventBanner: Record<Kategorie, {
  gradient: string;
  icon: string;
  label: string;
}> = {
  heimspiel: {
    gradient: 'linear-gradient(135deg, #1a7a1a 0%, #2ecc40 60%, #145214 100%)',
    icon: '⚽',
    label: 'Heimspiel',
  },
  vereinsfest: {
    gradient: 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 40%, #b8860b 100%)',
    icon: '🎪',
    label: 'Vereinsfest',
  },
  'flag-football': {
    gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    icon: '🏈',
    label: 'Flag-Football',
  },
  turnier: {
    gradient: 'linear-gradient(135deg, #0d631b 0%, #1a7a1a 50%, #145214 100%)',
    icon: '🏆',
    label: 'Turnier',
  },
};

export const getBanner = (kategorie?: Kategorie | null) =>
  eventBanner[kategorie ?? 'heimspiel'];
