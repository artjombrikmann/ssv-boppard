export type Kategorie = 'heimspiel' | 'vereinsfest' | 'flag-football' | 'turnier';

export const eventBanner: Record<Kategorie, {
  gradient: string;
  icon: string;
  label: string;
}> = {
  heimspiel: {
    gradient: 'linear-gradient(135deg, #0a1a0f 0%, #0d2d10 50%, #0a1a0f 100%)',
    icon: '⚽',
    label: 'Heimspiel',
  },
  vereinsfest: {
    gradient: 'linear-gradient(135deg, #1a0a00 0%, #3d1a00 50%, #1a0a00 100%)',
    icon: '🎉',
    label: 'Vereinsfest',
  },
  'flag-football': {
    gradient: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f3d 50%, #0a0a1a 100%)',
    icon: '🏈',
    label: 'Flag-Football',
  },
  turnier: {
    gradient: 'linear-gradient(135deg, #0a1a0f 0%, #0d2d10 40%, #0a1505 100%)',
    icon: '⚽',
    label: 'WM 2026',
  },
};

export const getBanner = (kategorie?: Kategorie | null) =>
  eventBanner[kategorie ?? 'heimspiel'];
