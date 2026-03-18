import { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { formatDateTime, statusBadge } from '../../utils/format';

export function ChatThread() {
  const { sessions, selectedSessionId } = useSessionStore();
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});
  const session = sessions.find((item) => item.id === selectedSessionId);

  if (!session) {
    return <div className="panel flex h-full items-center justify-center text-app-muted">Select a session.</div>;
  }

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="border-b border-app-border px-4 py-3">
        <h2 className="text-sm font-semibold">{session.title}</h2>
        <p className="mt-1 text-xs text-app-muted">Session thread with mock streaming and collapsible tool outputs.</p>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
        {session.messages.map((message) => (
          <article key={message.id} className="space-y-2 rounded-lg border border-app-border bg-app-panelAlt p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-app-border px-2 py-1 text-[11px] uppercase tracking-wide text-app-muted">
                  {message.role}
                </span>
                {message.streaming ? (
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadge('running')}`}>streaming</span>
                ) : null}
              </div>
              <span className="text-[11px] text-app-muted">{formatDateTime(message.timestamp)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-app-text">{message.content}</p>
            {message.toolEvents?.map((tool) => {
              const open = openTools[tool.id] ?? true;
              return (
                <div key={tool.id} className="rounded-md border border-app-border bg-app-bg">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                    onClick={() => setOpenTools((state) => ({ ...state, [tool.id]: !open }))}
                  >
                    <div>
                      <p className="text-xs font-medium text-app-text">{tool.title}</p>
                      <p className="text-[11px] text-app-muted">{formatDateTime(tool.timestamp)}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadge(tool.status)}`}>{tool.status}</span>
                  </button>
                  {open && tool.collapsible !== false ? (
                    <pre className="overflow-x-auto border-t border-app-border px-3 py-3 font-mono text-xs text-app-muted">
                      {tool.output}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}
