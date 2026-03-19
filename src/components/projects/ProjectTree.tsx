import type { ProjectFile } from '../../types';
import { useProjectsStore } from '../../stores/projectsStore';

function TreeNode({ node, depth = 0 }: { node: ProjectFile; depth?: number }) {
  const { selectedFilePath, selectFile } = useProjectsStore();

  return (
    <div>
      <button
        type="button"
        className={`flex w-full items-center rounded-md px-2 py-1 text-left text-sm ${
          selectedFilePath === node.path ? 'bg-app-accent/10 text-app-text' : 'text-app-muted hover:bg-app-panelAlt'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (node.type === 'file') {
            void selectFile(node.path);
          }
        }}
      >
        <span className="mr-2 text-xs">{node.type === 'folder' ? '▸' : '•'}</span>
        {node.name}
      </button>
      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ProjectTree({ files }: { files: ProjectFile[] }) {
  if (files.length === 0) {
    return <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-3 text-sm text-app-muted">No readable files were returned for this root yet.</div>;
  }

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <TreeNode key={file.id} node={file} />
      ))}
    </div>
  );
}
