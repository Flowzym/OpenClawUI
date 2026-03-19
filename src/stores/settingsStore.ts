import { create } from 'zustand';
import { mockSettings } from '../data/mockData';
import type { AppSettings } from '../types';

const SETTINGS_STORAGE_KEY = 'openclaw.operator-ui.settings.v1';
const defaultSettings: AppSettings = mockSettings;

interface SettingsStore {
  settings: AppSettings;
  updateGatewayUrl: (gatewayUrl: string) => void;
  toggleTheme: () => void;
  toggleAdvanced: (key: keyof AppSettings['advanced']) => void;
  setProjectRoots: (projectRoots: string[]) => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isTheme = (value: unknown): value is AppSettings['theme'] => value === 'dark' || value === 'system';

const normalizeTrailingSeparators = (value: string) => {
  if (value === '/') return value;
  if (/^[A-Za-z]:[\\/]?$/.test(value)) return value;
  return value.replace(/[\\/]+$/, '');
};

export const normalizeProjectRoot = (root: string) => normalizeTrailingSeparators(root.trim());

export const normalizeProjectRoots = (roots: string[]) => roots.map(normalizeProjectRoot).filter(Boolean);

const sanitizeSettings = (input: unknown): AppSettings => {
  if (!isRecord(input)) {
    return defaultSettings;
  }

  const advancedInput = isRecord(input.advanced) ? input.advanced : {};

  return {
    gatewayUrl: typeof input.gatewayUrl === 'string' && input.gatewayUrl.trim() ? input.gatewayUrl.trim() : defaultSettings.gatewayUrl,
    theme: isTheme(input.theme) ? input.theme : defaultSettings.theme,
    projectRoots: Array.isArray(input.projectRoots)
      ? normalizeProjectRoots(input.projectRoots.filter((root): root is string => typeof root === 'string'))
      : defaultSettings.projectRoots,
    advanced: {
      reconnect: typeof advancedInput.reconnect === 'boolean' ? advancedInput.reconnect : defaultSettings.advanced.reconnect,
      telemetry: typeof advancedInput.telemetry === 'boolean' ? advancedInput.telemetry : defaultSettings.advanced.telemetry,
    },
  };
};

const loadPersistedSettings = (): AppSettings => {
  if (typeof window === 'undefined') {
    return defaultSettings;
  }

  try {
    const rawValue = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawValue) {
      return defaultSettings;
    }

    return sanitizeSettings(JSON.parse(rawValue));
  } catch {
    return defaultSettings;
  }
};

const persistSettings = (settings: AppSettings) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore local persistence failures and keep the in-memory store usable.
  }
};

const initialSettings = loadPersistedSettings();

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: initialSettings,
  updateGatewayUrl: (gatewayUrl) =>
    set((state) => {
      const nextSettings: AppSettings = {
        ...state.settings,
        gatewayUrl,
      };
      persistSettings(nextSettings);
      return { settings: nextSettings };
    }),
  toggleTheme: () =>
    set((state) => {
      const nextSettings: AppSettings = {
        ...state.settings,
        theme: state.settings.theme === 'dark' ? 'system' : 'dark',
      };
      persistSettings(nextSettings);
      return { settings: nextSettings };
    }),
  toggleAdvanced: (key) =>
    set((state) => {
      const nextSettings: AppSettings = {
        ...state.settings,
        advanced: {
          ...state.settings.advanced,
          [key]: !state.settings.advanced[key],
        },
      };
      persistSettings(nextSettings);
      return { settings: nextSettings };
    }),
  setProjectRoots: (projectRoots) =>
    set((state) => {
      const nextSettings: AppSettings = {
        ...state.settings,
        projectRoots: normalizeProjectRoots(projectRoots),
      };
      persistSettings(nextSettings);
      return { settings: nextSettings };
    }),
}));
