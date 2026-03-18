import type { ChangeItem } from '../../types';

export function DiffViewer({ change }: { change?: ChangeItem }) {
  if (!change) {
    return <div className="panel flex h-full items-center justify-center text-app-muted">Select a change to view diff chunks.</div>;
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="border-b border-app-border px-4 py-3">
        <h2 className="text-sm font-semibold">{change.filePath}</h2>
        <p className="mt-1 text-xs text-app-muted">Mock patch workflow with review-ready diff chunks.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 font-mono text-xs">
        {change.chunks.map((chunk) => (
          <section key={chunk.id} className="overflow-hidden rounded-md border border-app-border">
            <div className="border-b border-app-border bg-app-panelAlt px-3 py-2 text-app-muted">{chunk.header}</div>
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
