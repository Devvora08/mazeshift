import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

const STORAGE_KEY = '@mazeshift/profile/v1';

export interface LevelRecord {
  completed: boolean;
  attempts: number;
  deaths: number;
  bestTimeMs: number | null;
  lastCompletedAt: string | null;
}

export interface ActiveRun {
  levelId: number;
  elapsedMs: number;
  startedAt: string;
}

interface SavedProfile {
  version: 1;
  highestUnlockedLevel: number;
  levels: Record<string, LevelRecord>;
  activeRun: ActiveRun | null;
  settings: { musicEnabled: boolean; soundEffectsEnabled: boolean; hapticsEnabled: boolean };
  /** Offline cache only. RevenueCat customer info remains the purchase source of truth. */
  premiumUnlocked: boolean;
}

interface ProgressState extends SavedProfile {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  startRun: (levelId: number, elapsedMs?: number) => void;
  checkpointRun: (levelId: number, elapsedMs: number) => void;
  recordDeath: (levelId: number, elapsedMs: number) => void;
  completeLevel: (levelId: number, elapsedMs: number) => void;
  abandonRun: () => void;
  setMusicEnabled: (enabled: boolean) => void;
  setSoundEffectsEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setPremiumUnlocked: (unlocked: boolean) => void;
}

const defaultProfile: SavedProfile = {
  version: 1,
  highestUnlockedLevel: 1,
  levels: {},
  activeRun: null,
  settings: { musicEnabled: true, soundEffectsEnabled: true, hapticsEnabled: true },
  premiumUnlocked: false,
};

function recordFor(profile: SavedProfile, levelId: number): LevelRecord {
  return profile.levels[String(levelId)] ?? {
    completed: false, attempts: 0, deaths: 0, bestTimeMs: null, lastCompletedAt: null,
  };
}

let saveChain = Promise.resolve();
function persist(profile: SavedProfile) {
  const snapshot = JSON.stringify(profile);
  saveChain = saveChain.then(() => AsyncStorage.setItem(STORAGE_KEY, snapshot)).catch(error => {
    console.warn('Could not save MazeShift progress', error);
  });
}

function savedPart(state: ProgressState): SavedProfile {
  return { version: 1, highestUnlockedLevel: state.highestUnlockedLevel, levels: state.levels,
    activeRun: state.activeRun, settings: state.settings, premiumUnlocked: state.premiumUnlocked };
}

export const useProgressStore = create<ProgressState>((set, get) => {
  const commit = (patch: Partial<SavedProfile>) => set(state => {
    const next = { ...savedPart(state), ...patch };
    persist(next);
    return patch;
  });

  return {
    ...defaultProfile,
    hydrated: false,
    hydrate: async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as Partial<SavedProfile> & {
            settings?: Partial<SavedProfile['settings']> & { audioEnabled?: boolean };
          };
          const legacyAudio = saved.settings?.audioEnabled;
          set({ ...defaultProfile, ...saved,
            settings: {
              musicEnabled: saved.settings?.musicEnabled ?? legacyAudio ?? true,
              soundEffectsEnabled: saved.settings?.soundEffectsEnabled ?? legacyAudio ?? true,
              hapticsEnabled: saved.settings?.hapticsEnabled ?? true,
            }, hydrated: true });
          return;
        }
      } catch (error) {
        console.warn('Could not load MazeShift progress', error);
      }
      set({ hydrated: true });
    },
    startRun: (levelId, elapsedMs = 0) => {
      if (levelId === 0) return;
      const current = get();
      const old = recordFor(current, levelId);
      commit({
        levels: { ...current.levels, [levelId]: { ...old, attempts: old.attempts + 1 } },
        activeRun: { levelId, elapsedMs, startedAt: new Date().toISOString() },
      });
    },
    checkpointRun: (levelId, elapsedMs) => {
      if (levelId === 0 || get().activeRun?.levelId !== levelId) return;
      commit({ activeRun: { ...get().activeRun!, elapsedMs } });
    },
    recordDeath: (levelId, elapsedMs) => {
      if (levelId === 0) return;
      const current = get();
      const old = recordFor(current, levelId);
      commit({ levels: { ...current.levels, [levelId]: { ...old, deaths: old.deaths + 1 } },
        activeRun: { levelId, elapsedMs, startedAt: current.activeRun?.startedAt ?? new Date().toISOString() } });
    },
    completeLevel: (levelId, elapsedMs) => {
      if (levelId === 0) return;
      const current = get();
      const old = recordFor(current, levelId);
      commit({
        highestUnlockedLevel: Math.min(20, Math.max(current.highestUnlockedLevel, levelId + 1)),
        levels: { ...current.levels, [levelId]: { ...old, completed: true,
          bestTimeMs: old.bestTimeMs === null ? elapsedMs : Math.min(old.bestTimeMs, elapsedMs),
          lastCompletedAt: new Date().toISOString() } },
        activeRun: null,
      });
    },
    abandonRun: () => commit({ activeRun: null }),
    setMusicEnabled: enabled => commit({ settings: { ...get().settings, musicEnabled: enabled } }),
    setSoundEffectsEnabled: enabled => commit({ settings: { ...get().settings, soundEffectsEnabled: enabled } }),
    setHapticsEnabled: enabled => commit({ settings: { ...get().settings, hapticsEnabled: enabled } }),
    setPremiumUnlocked: premiumUnlocked => commit({ premiumUnlocked }),
  };
});

export function formatRunTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
