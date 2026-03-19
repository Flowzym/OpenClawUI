import type { ChangeItem } from '../../types';

interface DiffViewerProps {
  change?: ChangeItem;
  emptyMessage?: string;
  missingMessage?: string;
}

export function DiffViewer({ change, emptyMessage, missingMessage }: DiffViewerProps) {
  if (!change) {
    return (
      <div className="panel flex h-full items-center justify-center px-6 text-center text-app-muted">
        {missingMessage ?? emptyMessage ?? 'Select a dirty file to review the local before/after diff.'}
      </div>
    );
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="border-b border-app-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold text-app-text">{change.filePath}</h2>
          <span className="text-[11px] uppercase tracking-[0.18em] text-app-muted">{change.status}</span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-app-muted">{change.dirty ? 'dirty' : 'saved'}</span>
        </div>
        <p className="mt-1 text-xs text-app-muted">{change.projectName ?? change.projectId ?? 'Unknown project'} • {change.rootPath ?? 'Configured root'} • {change.summary}</p>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-app-muted">
          <span>{change.stats.chunkCount} section{change.stats.chunkCount === 1 ? '' : 's'}</span>
          <span>+{change.stats.addedLines}</span>
          <span>-{change.stats.removedLines}</span>
          <span>{change.stats.lineCount} diff line{change.stats.lineCount === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 font-mono text-xs">
        {change.chunks.map((chunk) => (
          <section key={chunk.id} className="overflow-hidden rounded-md border border-app-border">
            <div className="border-b border-app-border bg-app-panelAlt px-3 py-2 text-app-muted">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{chunk.header}</span>
                <span className="text-[11px]">{chunk.lineCount} lines • +{chunk.addedLines} • -{chunk.removedLines}</span>
              </div>
            </div>
            <div className="bg-app-bg px-3 py-3">
              {chunk.lines.map((line, index) => (
                <div
                  key={`${chunk.id}-${index}`}
                  className={`whitespace-pre-wrap ${
                    line.startsWith('+')
                      ? 'text-app-success'
                      : line.startsWith('-')
                        ? 'text-app-danger'
                        : 'text-app-text'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
