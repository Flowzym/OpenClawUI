import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../components/shared/Panel';
import { useProjectsStore } from '../stores/projectsStore';
import { normalizeProjectRoot, useSettingsStore } from '../stores/settingsStore';

const bridgeTone = {
  'local-dev-bridge': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  'bridge-unavailable': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  'mock-fallback': 'border-app-danger/40 bg-app-danger/10 text-app-danger',
} as const;

const runtimeDescriptions = {
  'local-dev-bridge': {
    title: 'Real local bridge via Vite dev runtime.',
    explanation: 'The UI confirmed the Vite /api/file-bridge integration and project/file actions are using real local filesystem access.',
    realAccess: true,
  },
  'bridge-unavailable': {
    title: 'Real bridge not available.',
    explanation: 'The browser is running, but the local Vite file bridge has not confirmed availability yet, so real local filesystem access is not active.',
    realAccess: false,
  },
  'mock-fallback': {
    title: 'Demo fallback is active.',
    explanation: 'The app could not use the real local bridge and switched to in-memory demo project/file data instead.',
    realAccess: false,
  },
} as const;

const rootsAreEqual = (left: string[], right: string[]) => left.length === right.length && left.every((value, index) => value === right[index]);

interface ValidatedRoots {
  normalizedRoots?: string[];
  error?: string;
}

const validateRoots = (draftRoots: string[]): ValidatedRoots => {
  const normalizedRoots: string[] = [];
  const seenRoots = new Set<string>();

  for (const draftRoot of draftRoots) {
    const normalizedRoot = normalizeProjectRoot(draftRoot);
    if (!normalizedRoot) {
      return { error: 'Project roots cannot be empty. Fill in each row or remove it before saving.' };
    }
    if (seenRoots.has(normalizedRoot)) {
      return { error: `Duplicate project root: ${normalizedRoot}` };
    }

    seenRoots.add(normalizedRoot);
    normalizedRoots.push(normalizedRoot);
  }

  return { normalizedRoots };
};

const hasNormalizedRoots = (value: ValidatedRoots): value is { normalizedRoots: string[] } => Array.isArray(value.normalizedRoots);

export function SettingsPage() {
  const { settings, updateGatewayUrl, toggleTheme, toggleAdvanced, setProjectRoots } = useSettingsStore();
  const bridgeStatus = useProjectsStore((state) => state.bridgeStatus);
  const loadingProjects = useProjectsStore((state) => state.loadingProjects);
  const projectError = useProjectsStore((state) => state.projectError);
  const [projectRootDrafts, setProjectRootDrafts] = useState(settings.projectRoots);
  const [projectRootsMessage, setProjectRootsMessage] = useState<string>();
  const runtimeDescription = runtimeDescriptions[bridgeStatus.kind];

  useEffect(() => {
    setProjectRootDrafts(settings.projectRoots);
  }, [settings.projectRoots]);

  const normalizedDraftState = useMemo(() => validateRoots(projectRootDrafts), [projectRootDrafts]);
  const rootsChanged = useMemo(() => {
    if (!hasNormalizedRoots(normalizedDraftState)) {
      return true;
    }

    return !rootsAreEqual(normalizedDraftState.normalizedRoots, settings.projectRoots);
  }, [normalizedDraftState, settings.projectRoots]);

  const saveProjectRoots = () => {
    if (!hasNormalizedRoots(normalizedDraftState)) {
      setProjectRootsMessage(normalizedDraftState.error);
      return;
    }

    setProjectRoots(normalizedDraftState.normalizedRoots);
    setProjectRootsMessage('Saved. The Projects page refreshes from this root list and clears stale project state before reloading.');
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Gateway & appearance" subtitle="Core operator settings for local Windows deployments.">
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="section-title">Gateway URL</span>
            <input className="input" value={settings.gatewayUrl} onChange={(event) => updateGatewayUrl(event.target.value)} />
            <span className="text-xs text-app-muted">Stored locally in this browser. Expected default: ws://127.0.0.1:18789</span>
          </label>
          <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-title">Theme</p>
                <p className="mt-2 text-sm text-app-muted">Dark mode first, with a system placeholder toggle.</p>
              </div>
              <button type="button" className="button-secondary" onClick={toggleTheme}>
                {settings.theme}
              </button>
            </div>
          </div>
          <div className="rounded-md border border-app-border bg-app-panelAlt p-3 text-xs text-app-muted">
            Gateway URL, theme, project roots, and advanced toggles persist in this browser so the UI can restore them after restart.
          </div>
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Project roots" subtitle="Configured roots drive what the Projects page initializes and reloads.">
          <div className="space-y-3">
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3 text-xs text-app-muted">
              Save Windows or WSL repo roots here. Changing this list refreshes the Projects workflow against the new root set and clears stale project/file state first.
            </div>
            <div className="space-y-2">
              {projectRootDrafts.map((root, index) => (
                <div key={`${index}:${root}`} className="flex gap-2">
                  <input
                    className="input flex-1 font-mono text-xs"
                    value={root}
                    onChange={(event) => {
                      const nextDrafts = [...projectRootDrafts];
                      nextDrafts[index] = event.target.value;
                      setProjectRootDrafts(nextDrafts);
                      setProjectRootsMessage(undefined);
                    }}
                    placeholder="C:/repos/OpenClawUI or /mnt/c/repos/OpenClawUI"
                  />
                  <button
                    type="button"
                    className="button-secondary shrink-0"
                    onClick={() => {
                      setProjectRootDrafts(projectRootDrafts.filter((_, draftIndex) => draftIndex !== index));
                      setProjectRootsMessage(undefined);
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {projectRootDrafts.length === 0 ? <p className="text-xs text-app-muted">No project roots saved yet.</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setProjectRootDrafts([...projectRootDrafts, '']);
                  setProjectRootsMessage(undefined);
                }}
              >
                Add root
              </button>
              <button type="button" className="button-secondary" onClick={() => setProjectRootDrafts(settings.projectRoots)} disabled={!rootsChanged}>
                Reset edits
              </button>
              <button type="button" className="button-primary" onClick={saveProjectRoots} disabled={!rootsChanged}>
                Save roots
              </button>
            </div>
            {hasNormalizedRoots(normalizedDraftState) ? (
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3 text-xs text-app-muted">
                <p className="section-title">Normalized roots preview</p>
                <div className="mt-2 space-y-1 font-mono">
                  {normalizedDraftState.normalizedRoots.length > 0 ? (
                    normalizedDraftState.normalizedRoots.map((root) => <p key={root}>{root}</p>)
                  ) : (
                    <p>No roots configured.</p>
                  )}
                </div>
              </div>
            ) : null}
            {projectRootsMessage ? (
              <div className={`rounded-md border px-3 py-2 text-xs ${hasNormalizedRoots(normalizedDraftState) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-app-danger/40 bg-app-danger/10 text-app-danger'}`}>
                {projectRootsMessage}
              </div>
            ) : null}
          </div>
        </Panel>
        <Panel title="File runtime" subtitle="Operator-visible file access mode for this UI session.">
          <div className={`rounded-md border px-3 py-3 text-xs ${bridgeTone[bridgeStatus.kind]}`}>
            <p className="section-title text-current">{bridgeStatus.label}</p>
            <p className="mt-2 leading-5 text-current/90">Mode: <span className="font-mono">{bridgeStatus.kind}</span></p>
            <p className="mt-2 leading-5 text-current/90">{runtimeDescription.title}</p>
            <p className="mt-2 leading-5 text-current/90">{runtimeDescription.explanation}</p>
            <p className="mt-2 leading-5 text-current/90">{bridgeStatus.detail}</p>
            <p className="mt-3 text-current/80">Real local file access: {runtimeDescription.realAccess ? 'Active' : 'Inactive'}</p>
            <p className="mt-2 text-current/80">
              Supported real mode today: run the UI with <span className="font-mono">npm run dev</span> so the local Vite bridge can answer filesystem requests after restart.
            </p>
          </div>
        </Panel>
        <Panel title="Advanced settings" subtitle="Placeholders for reconnection and telemetry behavior.">
          <div className="space-y-2">
            <button type="button" className="button-secondary w-full justify-between" onClick={() => toggleAdvanced('reconnect')}>
              <span>Auto reconnect</span>
              <span>{settings.advanced.reconnect ? 'On' : 'Off'}</span>
            </button>
            <button type="button" className="button-secondary w-full justify-between" onClick={() => toggleAdvanced('telemetry')}>
              <span>Telemetry</span>
              <span>{settings.advanced.telemetry ? 'On' : 'Off'}</span>
            </button>
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3 text-xs text-app-muted">
              {loadingProjects ? 'Projects are refreshing for the active root/runtime settings.' : 'Projects reload automatically when you save a new root list.'}
              {projectError ? <p className="mt-2 text-app-danger">Latest Projects status: {projectError}</p> : null}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
