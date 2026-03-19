import { useMemo } from 'react';
import { useProjectsStore } from '../../stores/projectsStore';

const fileLanguage = (path: string) => {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.py')) return 'python';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
};

export function FileEditor() {
  const {
    projects,
    selectedProjectId,
    selectedFilePath,
    getOpenFile,
    updateActiveFileContent,
    saveSelectedFile,
    resetFile,
  } = useProjectsStore();
  const project = projects.find((item) => item.id === selectedProjectId);
  const openFile = selectedProjectId && selectedFilePath ? getOpenFile(selectedProjectId, selectedFilePath) : undefined;

  const activeContent = useMemo(() => {
    if (!selectedFilePath) return '';
    return openFile?.content ?? '';
  }, [openFile?.content, selectedFilePath]);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{selectedFilePath || 'Editor'}</h2>
            {openFile?.dirty ? (
              <span className="rounded-full border border-app-warning/40 bg-app-warning/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-app-warning">
                Unsaved
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-app-muted">
            {project ? `${project.rootPath} • local text bridge` : 'Select a configured project file to inspect and edit.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-app-border px-2 py-1 text-[11px] uppercase text-app-muted">
            {fileLanguage(selectedFilePath)}
          </span>
          <button type="button" className="button-secondary" onClick={() => resetFile(selectedFilePath)} disabled={!openFile?.dirty}>
            Reset
          </button>
          <button type="button" className="button-primary" onClick={() => void saveSelectedFile()} disabled={!openFile?.dirty || openFile?.isLoading}>
            Save
          </button>
        </div>
      </div>
      {openFile?.error ? (
        <div className="m-4 rounded-md border border-app-danger/40 bg-app-danger/10 p-3 text-sm text-app-danger">
          Unable to load <span className="font-mono text-xs">{selectedFilePath}</span>: {openFile.error}
        </div>
      ) : openFile?.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-app-muted">Loading file from the local bridge…</div>
      ) : selectedFilePath ? (
        <textarea
          className="min-h-0 flex-1 resize-none bg-app-bg px-4 py-4 font-mono text-xs leading-6 text-app-text outline-none"
          spellCheck={false}
          value={activeContent}
          onChange={(event) => updateActiveFileContent(event.target.value)}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-app-muted">Select a file from the project tree to load it.</div>
      )}
    </div>
  );
}
