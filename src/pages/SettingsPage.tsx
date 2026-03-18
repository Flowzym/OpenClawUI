import { Panel } from '../components/shared/Panel';
import { useSettingsStore } from '../stores/settingsStore';

export function SettingsPage() {
  const { settings, updateGatewayUrl, toggleTheme, toggleAdvanced } = useSettingsStore();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Gateway & appearance" subtitle="Core operator settings for local Windows deployments.">
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="section-title">Gateway URL</span>
            <input className="input" value={settings.gatewayUrl} onChange={(event) => updateGatewayUrl(event.target.value)} />
            <span className="text-xs text-app-muted">Expected default: ws://127.0.0.1:18789</span>
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
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="Project roots" subtitle="Placeholder list for future Windows workspace discovery.">
          <div className="space-y-2">
            {settings.projectRoots.map((root) => (
              <div key={root} className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2 font-mono text-xs">
                {root}
              </div>
            ))}
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
              TODO: add persisted settings, project root editing, and gateway transport tuning.
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
