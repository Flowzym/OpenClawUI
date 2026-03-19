import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import type { Project, ProjectFile } from './src/types';

const FILE_BRIDGE_HEADER = 'x-openclaw-file-bridge';
const FILE_BRIDGE_RUNTIME_HEADER = 'x-openclaw-file-bridge-runtime';
const LOCAL_RUNTIME_MODE = 'vite-dev-server';
const DEFAULT_IGNORES = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo']);

interface BridgeProject extends Project {
  resolvedRootPath: string;
}

interface RequestBody {
  projectId?: string;
  rootPath?: string;
  filePath?: string;
  content?: string;
  roots?: string[];
}

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(FILE_BRIDGE_HEADER, 'local-dev-bridge');
  res.setHeader(FILE_BRIDGE_RUNTIME_HEADER, LOCAL_RUNTIME_MODE);
  res.end(JSON.stringify(payload));
};

const readBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {} as RequestBody;
  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as RequestBody;
};

const isWindowsPath = (value: string) => /^[a-zA-Z]:[\\/]/.test(value);
const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');

const toWslPath = (value: string) => {
  if (!isWindowsPath(value)) return value;

  const normalized = normalizeSlashes(value);
  const drive = normalized.slice(0, 1).toLowerCase();
  const remainder = normalized.slice(2);
  return path.posix.normalize(`/mnt/${drive}${remainder}`);
};

const toDisplayRoot = (configuredRoot: string) => normalizeSlashes(configuredRoot);

const resolveRootPath = async (configuredRoot: string) => {
  const candidate = toWslPath(configuredRoot.trim());
  return fs.realpath(candidate).catch(() => candidate);
};

const toProjectId = (rootPath: string) =>
  rootPath
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project-root';

const detectLanguage = (filePath: string) => {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!ext) return 'text';
  if (ext === 'md') return 'markdown';
  if (ext === 'py') return 'python';
  return ext;
};

const compareEntries = (left: ProjectFile, right: ProjectFile) => {
  if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
  return left.name.localeCompare(right.name);
};

const readTree = async (rootPath: string, currentFsPath: string, currentRelativePath = ''): Promise<ProjectFile[]> => {
  const entries = await fs.readdir(currentFsPath, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry): Promise<ProjectFile | null> => {
    if (DEFAULT_IGNORES.has(entry.name)) return null;

    const relativePath = currentRelativePath ? `${currentRelativePath}/${entry.name}` : entry.name;
    const fsPath = path.join(currentFsPath, entry.name);

    if (entry.isDirectory()) {
      const children = await readTree(rootPath, fsPath, relativePath);
      return {
        id: `${rootPath}:${relativePath}`,
        name: entry.name,
        path: relativePath,
        type: 'folder',
        children,
      };
    }

    return {
      id: `${rootPath}:${relativePath}`,
      name: entry.name,
      path: relativePath,
      type: 'file',
      language: detectLanguage(relativePath),
    };
  }));

  return files.reduce<ProjectFile[]>((acc, value) => {
    if (value) acc.push(value);
    return acc;
  }, []).sort(compareEntries);
};

const withinRoot = (rootPath: string, filePath: string) => {
  const resolved = path.resolve(rootPath, filePath);
  const relative = path.relative(rootPath, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path escapes configured root: ${filePath}`);
  }
  return resolved;
};

const buildProject = async (configuredRoot: string): Promise<BridgeProject> => {
  const displayRoot = toDisplayRoot(configuredRoot);
  const resolvedRootPath = await resolveRootPath(configuredRoot);
  const projectName = path.basename(displayRoot) || displayRoot;

  try {
    const stats = await fs.stat(resolvedRootPath);
    if (!stats.isDirectory()) {
      throw new Error('Configured root is not a directory.');
    }

    return {
      id: toProjectId(displayRoot),
      name: projectName,
      rootPath: displayRoot,
      resolvedRootPath,
      branch: 'local',
      status: 'ready',
      files: [],
      openTabs: [],
      activeFilePath: '',
    };
  } catch {
    return {
      id: toProjectId(displayRoot),
      name: projectName,
      rootPath: displayRoot,
      resolvedRootPath,
      branch: 'local',
      status: 'error',
      files: [],
      openTabs: [],
      activeFilePath: '',
    };
  }
};

const createMiddleware = (): Connect.NextHandleFunction => async (req, res, next) => {
  if (!req.url?.startsWith('/api/file-bridge/')) {
    next();
    return;
  }

  try {
    const requestPath = req.url.replace(/\?.*$/, '');

    if (req.method === 'GET' && requestPath === '/api/file-bridge/status') {
      sendJson(res, 200, {
        mode: 'local-dev-bridge',
        runtime: LOCAL_RUNTIME_MODE,
        detail: 'Filesystem access is available through the local Vite middleware bridge.',
      });
      return;
    }

    const body = await readBody(req);

    if (req.method === 'POST' && requestPath === '/api/file-bridge/projects') {
      const roots = body.roots ?? [];
      const projects = await Promise.all(roots.map(buildProject));
      sendJson(res, 200, { projects, runtime: LOCAL_RUNTIME_MODE });
      return;
    }

    if (req.method === 'POST' && requestPath === '/api/file-bridge/tree') {
      if (!body.rootPath) {
        sendJson(res, 400, { error: 'rootPath is required.' });
        return;
      }

      const resolvedRootPath = await resolveRootPath(body.rootPath);
      const files = await readTree(body.rootPath, resolvedRootPath);
      sendJson(res, 200, { files, runtime: LOCAL_RUNTIME_MODE });
      return;
    }

    if (req.method === 'POST' && requestPath === '/api/file-bridge/read') {
      if (!body.rootPath || !body.filePath) {
        sendJson(res, 400, { error: 'rootPath and filePath are required.' });
        return;
      }

      const resolvedRootPath = await resolveRootPath(body.rootPath);
      const resolvedFilePath = withinRoot(resolvedRootPath, body.filePath);
      const content = await fs.readFile(resolvedFilePath, 'utf-8');
      const stats = await fs.stat(resolvedFilePath);

      sendJson(res, 200, {
        file: {
          path: normalizeSlashes(body.filePath),
          content,
          encoding: 'utf-8',
          language: detectLanguage(body.filePath),
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        },
        runtime: LOCAL_RUNTIME_MODE,
      });
      return;
    }

    if (req.method === 'POST' && requestPath === '/api/file-bridge/write') {
      if (!body.rootPath || !body.filePath || typeof body.content !== 'string') {
        sendJson(res, 400, { error: 'rootPath, filePath, and content are required.' });
        return;
      }

      const resolvedRootPath = await resolveRootPath(body.rootPath);
      const resolvedFilePath = withinRoot(resolvedRootPath, body.filePath);
      await fs.mkdir(path.dirname(resolvedFilePath), { recursive: true });
      await fs.writeFile(resolvedFilePath, body.content, 'utf-8');
      const stats = await fs.stat(resolvedFilePath);

      sendJson(res, 200, {
        file: {
          path: normalizeSlashes(body.filePath),
          content: body.content,
          encoding: 'utf-8',
          language: detectLanguage(body.filePath),
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        },
        runtime: LOCAL_RUNTIME_MODE,
      });
      return;
    }

    sendJson(res, 404, { error: 'Unsupported file bridge route.' });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unknown file bridge error.',
    });
  }
};

export const openClawFileBridge = (): Plugin => ({
  name: 'openclaw-local-dev-file-bridge',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(createMiddleware());
  },
});
