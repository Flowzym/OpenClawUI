import { create } from 'zustand';
import { mockChanges } from '../data/mockData';
import type { ChangeItem } from '../types';

interface ChangesStore {
  changes: ChangeItem[];
  selectedChangeId: string;
  selectChange: (changeId: string) => void;
  acceptChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  savePatch: () => void;
}

export const useChangesStore = create<ChangesStore>((set) => ({
  changes: mockChanges,
  selectedChangeId: mockChanges[0]?.id ?? '',
  selectChange: (changeId) => set({ selectedChangeId: changeId }),
  acceptChange: (changeId) =>
    set((state) => ({
      changes: state.changes.map((change) =>
        change.id === changeId ? { ...change, summary: `${change.summary} (accepted in mock workflow)` } : change,
      ),
    })),
  rejectChange: (changeId) =>
    set((state) => ({
      changes: state.changes.map((change) =>
        change.id === changeId ? { ...change, summary: `${change.summary} (rejected in mock workflow)` } : change,
      ),
    })),
  savePatch: () =>
    set((state) => ({
      changes: state.changes.map((change) => ({
        ...change,
        summary: `${change.summary} (saved locally in mock workflow)`,
      })),
    })),
}));
