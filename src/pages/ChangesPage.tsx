import { DiffViewer } from '../components/changes/DiffViewer';
import { Panel } from '../components/shared/Panel';
import { useChangesStore } from '../stores/changesStore';

export function ChangesPage() {
  const { changes, selectedChangeId, selectChange, acceptChange, rejectChange, savePatch } = useChangesStore();
  const selected = changes.find((item) => item.id === selectedChangeId);

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Changed files" subtitle="Mock patch review queue with accept/reject/save actions.">
        <div className="space-y-2">
          {changes.map((change) => (
            <button
              key={change.id}
              type="button"
              onClick={() => selectChange(change.id)}
              className={`w-full rounded-md border px-3 py-3 text-left ${
                change.id === selectedChangeId ? 'border-app-accent bg-app-accent/10' : 'border-app-border bg-app-panelAlt'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{change.filePath}</p>
                <span className="text-[11px] uppercase text-app-muted">{change.status}</span>
              </div>
              <p className="mt-2 text-xs text-app-muted">{change.summary}</p>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 grid-rows-[auto_minmax(0,1fr)]">
        <Panel
          title="Patch actions"
          subtitle="Actions are mock-only until the real patch workflow is wired."
          actions={
            <>
              <button type="button" className="button-secondary" onClick={() => selected && acceptChange(selected.id)}>
                Accept
              </button>
              <button type="button" className="button-secondary" onClick={() => selected && rejectChange(selected.id)}>
                Reject
              </button>
              <button type="button" className="button-primary" onClick={savePatch}>
                Save
              </button>
            </>
          }
        >
          <p className="text-sm text-app-muted">TODO: connect accept/reject/save actions to a real gateway-backed patch application pipeline.</p>
        </Panel>
        <DiffViewer change={selected} />
      </div>
    </div>
  );
}
