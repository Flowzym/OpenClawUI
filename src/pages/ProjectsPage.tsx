import { DiffViewer } from '../components/changes/DiffViewer';
import { FileEditor } from '../components/projects/FileEditor';
import { ProjectTree } from '../components/projects/ProjectTree';
import { Panel } from '../components/shared/Panel';
import { useProjectsStore } from '../stores/projectsStore';

export function ProjectsPage() {
  const {
    projects,
    selectedProjectId,
    selectedFilePath,
    selectProject,
    toggleInspector,
    fileInspectorOpen,
    sendFileToSession,
    bridgeStatus,
    projectError,
    loadingProjects,
    loadingTree,
    changes,
    getOpenFile,
    saveSelectedFile,
  } = useProjectsStore();
  const project = projects.find((item) => item.id === selectedProjectId);
  const openFile = project ? getOpenFile(project.id, selectedFilePath) : undefined;
  const diff = changes.find((item) => item.projectId === selectedProjectId && item.filePath === selectedFilePath);

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[260px_300px_minmax(0,1fr)_280px]">
      <Panel
        title="Projects"
        subtitle={bridgeStatus.kind === 'bridge' ? 'Configured roots served by the local WSL-aware file bridge.' : `Mock fallback active: ${bridgeStatus.reason}`}
      >
        <div className="space-y-2">
          {loadingProjects ? <p className="text-sm text-app-muted">Loading configured roots…</p> : null}
          {projects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-md border px-3 py-3 text-left ${
                item.id === selectedProjectId ? 'border-app-accent bg-app-accent/10' : 'border-app-border bg-app-panelAlt'
              }`}
              onClick={() => void selectProject(item.id)}
            >
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-app-muted">{item.rootPath}</p>
              <p className="mt-2 text-[11px] text-app-muted">Bridge {item.status} • {item.branch}</p>
            </button>
          ))}
          {projectError ? <div className="rounded-md border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-xs text-app-danger">{projectError}</div> : null}
        </div>
      </Panel>
      <Panel title="Project tree" subtitle="Real directory tree for the selected configured root." className="min-h-0">
        <div className="h-[calc(100vh-260px)] overflow-auto">
          {loadingTree ? <p className="px-2 py-2 text-sm text-app-muted">Reading project tree…</p> : null}
          <ProjectTree files={project?.files ?? []} />
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 grid-rows-[auto_minmax(0,1fr)_260px]">
        <Panel
          title="File tabs"
          subtitle="Open files loaded through the local file bridge."
          actions={
            <>
              <button type="button" className="button-secondary" onClick={() => void sendFileToSession(selectedFilePath, 'sess-1002')} disabled={!selectedFilePath || Boolean(openFile?.error)}>
                Send file to session
              </button>
              <button type="button" className="button-primary" onClick={() => void saveSelectedFile()} disabled={!openFile?.dirty || openFile?.isLoading}>
                Save file
              </button>
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            {project?.openTabs.map((tab) => {
              const tabFile = project ? getOpenFile(project.id, tab.path) : undefined;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`rounded-full border px-3 py-1 text-xs ${tab.path === selectedFilePath ? 'border-app-accent text-app-text' : 'border-app-border text-app-muted'}`}
                  onClick={() => void useProjectsStore.getState().selectFile(tab.path)}
                >
                  {tab.title}{tabFile?.dirty ? ' *' : ''}
                </button>
              );
            })}
          </div>
        </Panel>
        <FileEditor />
        <DiffViewer change={diff} />
      </div>
      <Panel
        title="File inspector"
        subtitle="Metadata and local-save workflow for the active file."
        actions={
          <button type="button" className="button-secondary" onClick={toggleInspector}>
            {fileInspectorOpen ? 'Hide' : 'Show'}
          </button>
        }
      >
        {fileInspectorOpen ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
              <p className="section-title">Path</p>
              <p className="mt-2 break-all font-mono text-xs">{selectedFilePath || 'No file selected'}</p>
            </div>
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
              <p className="section-title">State</p>
              <div className="mt-3 space-y-2 text-xs text-app-muted">
                <p>Dirty: {openFile?.dirty ? 'Yes' : 'No'}</p>
                <p>Language: {openFile?.language ?? 'n/a'}</p>
                <p>Bytes: {openFile?.size ?? 0}</p>
                <p>Last saved: {openFile?.updatedAt ?? 'n/a'}</p>
              </div>
            </div>
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
              <p className="section-title">Actions</p>
              <div className="mt-3 grid gap-2">
                <button type="button" className="button-secondary" onClick={() => void sendFileToSession(selectedFilePath, 'sess-1002')} disabled={!selectedFilePath || Boolean(openFile?.error)}>
                  Queue for session context
                </button>
                <button type="button" className="button-secondary" onClick={() => void saveSelectedFile()} disabled={!openFile?.dirty || openFile?.isLoading}>
                  Save current file
                </button>
              </div>
            </div>
            {openFile?.error ? (
              <div className="rounded-md border border-app-danger/40 bg-app-danger/10 p-3 text-xs text-app-danger">
                {openFile.error}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-app-muted">Inspector hidden.</p>
        )}
      </Panel>
    </div>
  );
}
