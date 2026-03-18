import { create } from 'zustand';
import { mockSettings } from '../data/mockData';
import type { AppSettings } from '../types';

interface SettingsStore {
  settings: AppSettings;
  updateGatewayUrl: (gatewayUrl: string) => void;
  toggleTheme: () => void;
  toggleAdvanced: (key: keyof AppSettings['advanced']) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: mockSettings,
  updateGatewayUrl: (gatewayUrl) => set((state) => ({ settings: { ...state.settings, gatewayUrl } })),
  toggleTheme: () =>
    set((state) => ({
      settings: {
        ...state.settings,
        theme: state.settings.theme === 'dark' ? 'system' : 'dark',
      },
    })),
  toggleAdvanced: (key) =>
    set((state) => ({
      settings: {
        ...state.settings,
        advanced: {
          ...state.settings.advanced,
          [key]: !state.settings.advanced[key],
        },
      },
    })),
}));
