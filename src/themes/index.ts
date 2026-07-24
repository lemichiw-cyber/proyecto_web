export type ThemeName =
  | 'light' | 'dark' | 'pastel' | 'sunset' | 'dawn'
  | 'ocean' | 'mlp' | 'chicawa' | 'sakura' | 'paraiso';

export interface Theme {
  id: ThemeName;
  label: string;
  icon: string;
  colors: {
    primary: string;
    primaryLight: string;
    bg: string;
    bgSecondary: string;
    text: string;
    textSecondary: string;
    border: string;
    green: string;
    greenLight: string;
    red: string;
    redLight: string;
    purple: string;
  };
}

export const themes: Record<ThemeName, Theme> = {
  light: {
    id: 'light',
    label: 'Claro',
    icon: '☀️',
    colors: {
      primary: '#2563EB', primaryLight: '#DBEAFE',
      bg: '#FFFFFF', bgSecondary: '#F8FAFC',
      text: '#0F172A', textSecondary: '#475569',
      border: '#E2E8F0',
      green: '#16A34A', greenLight: '#DCFCE7',
      red: '#DC2626', redLight: '#FEE2E2',
      purple: '#7C3AED'
    }
  },
  dark: {
    id: 'dark',
    label: 'Oscuro',
    icon: '🌙',
    colors: {
      primary: '#60A5FA', primaryLight: '#1E3A5F',
      bg: '#0B0F17', bgSecondary: '#111827',
      text: '#F1F5F9', textSecondary: '#94A3B8',
      border: '#1F2937',
      green: '#22C55E', greenLight: '#052E16',
      red: '#EF4444', redLight: '#3B0A0A',
      purple: '#A78BFA'
    }
  },
  pastel: {
    id: 'pastel',
    label: 'Pastel',
    icon: '🍦',
    colors: {
      primary: '#B5E8E0', primaryLight: '#E0F7F4',
      bg: '#FDFBF7', bgSecondary: '#F5F0E8',
      text: '#4A4A4A', textSecondary: '#7D7D7D',
      border: '#E8E0D8',
      green: '#88D498', greenLight: '#E8F5E9',
      red: '#F4A6A6', redLight: '#FDEDEC',
      purple: '#C5B4E3'
    }
  },
  sunset: {
    id: 'sunset',
    label: 'Atardecer',
    icon: '🌅',
    colors: {
      primary: '#FF8C42', primaryLight: '#FFF0E6',
      bg: '#1A0F0A', bgSecondary: '#2D1B12',
      text: '#FFF5EB', textSecondary: '#D4A57A',
      border: '#4A2C1A',
      green: '#4ADE80', greenLight: '#0F2E18',
      red: '#FF6B6B', redLight: '#3D1414',
      purple: '#D9A3FF'
    }
  },
  dawn: {
    id: 'dawn',
    label: 'Amanecer',
    icon: '🌄',
    colors: {
      primary: '#F59E0B', primaryLight: '#FFFBEB',
      bg: '#FFF8F0', bgSecondary: '#FFF0E0',
      text: '#3D2C0E', textSecondary: '#8B6D2E',
      border: '#E8C99A',
      green: '#22C55E', greenLight: '#ECFDF5',
      red: '#EF4444', redLight: '#FEF2F2',
      purple: '#8B5CF6'
    }
  },
  ocean: {
    id: 'ocean',
    label: 'Océano',
    icon: '🌊',
    colors: {
      primary: '#0EA5E9', primaryLight: '#E0F2FE',
      bg: '#081625', bgSecondary: '#0C2338',
      text: '#E0F2FE', textSecondary: '#7DD3FC',
      border: '#1E3A5F',
      green: '#10B981', greenLight: '#064E3B',
      red: '#F87171', redLight: '#450A0A',
      purple: '#A855F7'
    }
  },
  mlp: {
    id: 'mlp',
    label: 'My Little Pony',
    icon: '🦄',
    colors: {
      primary: '#E040FB', primaryLight: '#FCE7F3',
      bg: '#FFF0F9', bgSecondary: '#FDE8F4',
      text: '#4A0E4E', textSecondary: '#A21CAF',
      border: '#F5C6E8',
      green: '#4ADE80', greenLight: '#D1FAE5',
      red: '#FB7185', redLight: '#FCE7F3',
      purple: '#D946EF'
    }
  },
  chicawa: {
    id: 'chicawa',
    label: 'Chicawa',
    icon: '🌸',
    colors: {
      primary: '#FF6FA3', primaryLight: '#FFF0F5',
      bg: '#FFF8FC', bgSecondary: '#FFF0F6',
      text: '#4A1D36', textSecondary: '#A83A7A',
      border: '#FFD6E8',
      green: '#6EE7B7', greenLight: '#ECFDF5',
      red: '#F87171', redLight: '#FEF2F2',
      purple: '#C084FC'
    }
  },
  sakura: {
    id: 'sakura',
    label: 'Sakura',
    icon: '🌸',
    colors: {
      primary: '#FF8FAB', primaryLight: '#FFF0F3',
      bg: '#FFFFFF', bgSecondary: '#FFF8F9',
      text: '#2D1B26', textSecondary: '#6B3D4B',
      border: '#FFD6E0',
      green: '#86EFAC', greenLight: '#ECFDF5',
      red: '#FCA5A5', redLight: '#FEF2F2',
      purple: '#F0ABFC'
    }
  },
  paraiso: {
    id: 'paraiso',
    label: 'Paraíso',
    icon: '🏝️',
    colors: {
      primary: '#FF8C42', primaryLight: '#FFE8D6',
      bg: '#0D0B14', bgSecondary: '#1A1625',
      text: '#FDF6F0', textSecondary: '#C9B8A8',
      border: '#3D2F28',
      green: '#4ADE80', greenLight: '#0F2E18',
      red: '#FB7185', redLight: '#3D1414',
      purple: '#D9A3FF'
    }
  }
};

const THEME_KEY = 'incoaTheme';
const VIDEO_OPACITY: Record<ThemeName, number> = {
  light: 0, dark: 0, pastel: 0, sunset: 0, dawn: 0,
  ocean: 0, mlp: 0, chicawa: 0, sakura: 0.35, paraiso: 0.6
};

export function getTheme(name: ThemeName): Theme {
  return themes[name] ?? themes.light;
}

export function applyTheme(name: ThemeName) {
  const theme = getTheme(name);
  const root = document.documentElement;
  Object.entries(theme.colors).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
  root.style.setProperty('--video-opacity', String(VIDEO_OPACITY[name] ?? 0));
  localStorage.setItem(THEME_KEY, name);
  document.body.className = document.body.className.replace(/theme-\w+/g, '');
  document.body.classList.add(`theme-${name}`);
  updateMetaThemeColor(theme.colors.primary);
}

export function loadSavedTheme(): ThemeName {
  const saved = localStorage.getItem(THEME_KEY) as ThemeName | null;
  return saved && themes[saved] ? saved : 'light';
}

function updateMetaThemeColor(color: string) {
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}