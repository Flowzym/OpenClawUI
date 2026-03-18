import { DiffViewer } from '../components/changes/DiffViewer';
import { FileEditor } from '../components/projects/FileEditor';
import { ProjectTree } from '../components/projects/ProjectTree';
import { Panel } from '../components/shared/Panel';
import { useChangesStore } from '../stores/changesStore';
import { useProjectsStore } from '../stores/projectsStore';

export function ProjectsPage() {
  const { projects, selectedProjectId, selectedFilePath, selectProject, toggleInspector, fileInspectorOpen, sendFileToSession } = useProjectsStore();
  const { changes } = useChangesStore();
  const project = projects.find((item) => item.id === selectedProjectId);
  const diff = changes.find((item) => item.filePath === selectedFilePath);

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[260px_300px_minmax(0,1fr)_280px]">
      <Panel title="Projects" subtitle="Workspace roots and active repositories.">
        <div className="space-y-2">
          {projects.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`w-full rounded-md border px-3 py-3 text-left ${
                item.id === selectedProjectId ? 'border-app-accent bg-app-accent/10' : 'border-app-border bg-app-panelAlt'
              }`}
              onClick={() => selectProject(item.id)}
            >
              <p className="font-medium">{item.name}</p>
              <p className="mt-1 text-xs text-app-muted">{item.rootPath}</p>
              <p className="mt-2 text-[11px] text-app-muted">Branch {item.branch} • {item.status}</p>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Project tree" subtitle="Mock file tree backed by file-service abstraction." className="min-h-0">
        <div className="h-[calc(100vh-260px)] overflow-auto">
          <ProjectTree files={project?.files ?? []} />
        </div>
      </Panel>
      <div className="grid min-h-0 gap-4 grid-rows-[auto_minmax(0,1fr)_260px]">
        <Panel
          title="File tabs"
          subtitle="Current open files for the selected project."
          actions={
            <>
              <button type="button" className="button-secondary" onClick={() => void sendFileToSession(selectedFilePath, 'sess-1002')}>
                Send file to session
              </button>
              <button type="button" className="button-secondary">
                Open diff
              </button>
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            {project?.openTabs.map((tab) => (
              <div key={tab.id} className={`rounded-full border px-3 py-1 text-xs ${tab.path === selectedFilePath ? 'border-app-accent text-app-text' : 'border-app-border text-app-muted'}`}>
                {tab.title}
              </div>
            ))}
          </div>
        </Panel>
        <FileEditor />
        <DiffViewer change={diff} />
      </div>
      <Panel
        title="File inspector"
        subtitle="Metadata and action placeholder for the active file."
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
              <p className="section-title">Actions</p>
              <div className="mt-3 grid gap-2">
                <button type="button" className="button-secondary">Queue for session context</button>
                <button type="button" className="button-secondary">Open external editor</button>
              </div>
            </div>
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3 text-xs text-app-muted">
              TODO: wire file metadata, blame, and save hooks via the real file-service layer.
            </div>
          </div>
        ) : (
          <p className="text-app-muted">Inspector hidden.</p>
        )}
      </Panel>
    </div>
  );
}
