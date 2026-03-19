import { DiffViewer } from '../components/changes/DiffViewer';
import { Panel } from '../components/shared/Panel';
import { useChangesStore } from '../stores/changesStore';
import { useProjectsStore } from '../stores/projectsStore';

const formatStatusLabel = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

export function ChangesPage() {
  const changes = useProjectsStore((state) => state.changes);
  const {
    selectedChangeId,
    selectionNotice,
    clearSelectionNotice,
    selectChange,
    applySelectedChange,
    rejectSelectedChange,
    saveAllChanges,
    rejectAllChanges,
  } = useChangesStore();
  const selected = changes.find((item) => item.id === selectedChangeId);
  const hasSelectedChangeId = selectedChangeId.length > 0;
  const selectedMissing = hasSelectedChangeId && !selected;

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Changed files" subtitle="Review local edited files before saving them through the active file runtime.">
        <div className="space-y-2">
          {changes.length === 0 ? (
            <p className="rounded-md border border-app-border bg-app-panelAlt px-3 py-3 text-sm text-app-muted">
              No local edits yet. Open a file, change text, and it will appear here for review.
            </p>
          ) : null}
          {changes.map((change, index) => (
            <button
              key={change.id}
              type="button"
              onClick={() => selectChange(change.id)}
              className={`w-full rounded-md border px-3 py-3 text-left transition ${
                change.id === selected?.id ? 'border-app-accent bg-app-accent/10' : 'border-app-border bg-app-panelAlt hover:border-app-accent/60'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-app-muted">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <span>{change.status}</span>
                    <span>{change.dirty ? 'dirty' : 'saved'}</span>
                  </div>
                  <p className="mt-2 truncate font-medium text-app-text">{change.filePath}</p>
                </div>
                <span className={`rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  change.id === selected?.id ? 'border-app-accent/60 text-app-accent' : 'border-app-border text-app-muted'
                }`}>
                  {change.id === selected?.id ? 'Selected' : 'Review'}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-app-muted">{change.projectName ?? change.projectId ?? 'Unknown project'} • {change.rootPath}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-app-muted">
                <span>{formatStatusLabel(change.stats.chunkCount, 'section')}</span>
                <span>+{change.stats.addedLines}</span>
                <span>-{change.stats.removedLines}</span>
                <span>{formatStatusLabel(change.stats.lineCount, 'diff line')}</span>
              </div>
              <p className="mt-2 text-xs text-app-muted">{change.summary}</p>
            </button>
          ))}
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 grid-rows-[auto_minmax(0,1fr)]">
        <Panel
          title="Change actions"
          subtitle="Apply saves the current file to disk. Reject restores the last saved content in memory."
          actions={
            <>
              <button type="button" className="button-secondary" onClick={() => void applySelectedChange()} disabled={!selected}>
                Apply
              </button>
              <button type="button" className="button-secondary" onClick={rejectSelectedChange} disabled={!selected}>
                Reject
              </button>
              <button type="button" className="button-secondary" onClick={() => void saveAllChanges()} disabled={changes.length === 0}>
                Save all
              </button>
              <button type="button" className="button-danger" onClick={rejectAllChanges} disabled={changes.length === 0}>
                Reject all
              </button>
            </>
          }
        >
          <div className="space-y-2 text-sm text-app-muted">
            <p>Diffs compare the current in-memory editor content against the last saved text loaded from the local file runtime.</p>
            {selectionNotice ? (
              <button type="button" onClick={clearSelectionNotice} className="w-full rounded-md border border-app-border bg-app-panelAlt px-3 py-2 text-left text-xs text-app-muted hover:border-app-accent/60">
                {selectionNotice}
              </button>
            ) : null}
            {selected ? (
              <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-3 text-xs text-app-muted">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span className="font-medium text-app-text">{selected.filePath}</span>
                  <span>{selected.projectName ?? selected.projectId ?? 'Unknown project'}</span>
                  <span>{selected.rootPath ?? 'Configured root'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  <span>Status: {selected.status}</span>
                  <span>Dirty: {selected.dirty ? 'yes' : 'no'}</span>
                  <span>{formatStatusLabel(selected.stats.chunkCount, 'section')}</span>
                  <span>+{selected.stats.addedLines}</span>
                  <span>-{selected.stats.removedLines}</span>
                </div>
              </div>
            ) : null}
            {selectedMissing ? (
              <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-3 text-xs text-app-muted">
                The selected change is no longer available. Pick another dirty file from the list.
              </div>
            ) : null}
          </div>
        </Panel>
        <DiffViewer
          change={selected}
          emptyMessage={changes.length === 0 ? 'No dirty files to review yet. Local edits will appear here as soon as they differ from saved disk content.' : undefined}
          missingMessage={selectedMissing ? 'The selected change disappeared after a save or reset. Choose another dirty file to continue review.' : undefined}
        />
      </div>
    </div>
  );
}
