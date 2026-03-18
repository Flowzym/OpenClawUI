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
  const { projects, selectedProjectId, selectedFilePath } = useProjectsStore();
  const project = projects.find((item) => item.id === selectedProjectId);

  const activeContent = useMemo(() => {
    const queue = [...(project?.files ?? [])];
    while (queue.length) {
      const node = queue.shift();
      if (!node) continue;
      if (node.path === selectedFilePath) return node.content ?? '// No mock content';
      if (node.children) queue.push(...node.children);
    }
    return '// Select a file to inspect';
  }, [project?.files, selectedFilePath]);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{selectedFilePath || 'Editor'}</h2>
          <p className="mt-1 text-xs text-app-muted">Mock file editor / preview surface.</p>
        </div>
        <span className="rounded-full border border-app-border px-2 py-1 text-[11px] uppercase text-app-muted">
          {fileLanguage(selectedFilePath)}
        </span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto bg-app-bg px-4 py-4 font-mono text-xs leading-6 text-app-text">{activeContent}</pre>
    </div>
  );
}
