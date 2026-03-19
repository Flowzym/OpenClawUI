import { useEffect } from 'react';
import { DiffViewer } from '../components/changes/DiffViewer';
import { Panel } from '../components/shared/Panel';
import { useChangesStore } from '../stores/changesStore';
import { useProjectsStore } from '../stores/projectsStore';

export function ChangesPage() {
  const changes = useProjectsStore((state) => state.changes);
  const { selectedChangeId, selectChange, acceptChange, rejectChange, savePatch } = useChangesStore();
  const selected = changes.find((item) => item.id === selectedChangeId) ?? changes[0];

  useEffect(() => {
    if (!selectedChangeId && changes[0]) {
      selectChange(changes[0].id);
      return;
    }

    if (selectedChangeId && !changes.some((change) => change.id === selectedChangeId)) {
      selectChange(changes[0]?.id ?? '');
    }
  }, [changes, selectChange, selectedChangeId]);

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Changed files" subtitle="Dirty local editor state derived from saved text versus current text.">
        <div className="space-y-2">
          {changes.length === 0 ? <p className="text-sm text-app-muted">No local edits yet. Open a file, change text, and it will appear here.</p> : null}
          {changes.map((change) => (
            <button
              key={change.id}
              type="button"
              onClick={() => selectChange(change.id)}
              className={`w-full rounded-md border px-3 py-3 text-left ${
                change.id === selected?.id ? 'border-app-accent bg-app-accent/10' : 'border-app-border bg-app-panelAlt'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{change.filePath}</p>
                <span className="text-[11px] uppercase text-app-muted">{change.status}</span>
              </div>
              <p className="mt-1 text-[11px] text-app-muted">{change.rootPath}</p>
              <p className="mt-2 text-xs text-app-muted">{change.summary}</p>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 grid-rows-[auto_minmax(0,1fr)]">
        <Panel
          title="Patch actions"
          subtitle="Local edited-file workflow only; git and gateway patch application remain out of scope."
          actions={
            <>
              <button type="button" className="button-secondary" onClick={() => selected && void acceptChange(selected.id)} disabled={!selected}>
                Save selected
              </button>
              <button type="button" className="button-secondary" onClick={() => selected && rejectChange(selected.id)} disabled={!selected}>
                Reject selected
              </button>
              <button type="button" className="button-primary" onClick={() => void savePatch()} disabled={changes.length === 0}>
                Save all
              </button>
            </>
          }
        >
          <p className="text-sm text-app-muted">Diffs are generated from the current in-memory editor content compared with the last successfully saved text loaded from the local file bridge.</p>
        </Panel>
        <DiffViewer change={selected} />
      </div>
    </div>
  );
}
