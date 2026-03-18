# OpenClaw Operator UI

A Windows-first React + TypeScript + Vite operator console for OpenClaw. This MVP is designed as a stable replacement shell for the default OpenClaw web UI, with mock-first state and service layers that can later be wired to the real OpenClaw gateway running in WSL2.

## Setup

```bash
npm install
npm run dev
```

Default local gateway target:

- `ws://127.0.0.1:18789`

## Project structure

```text
src/
  app/                # Router and app shell wiring
  components/
    changes/          # Diff and patch review components
    home/             # Dashboard cards
    layout/           # Sidebar and top bar
    logs/             # Live console UI
    projects/         # Tree and editor components
    sessions/         # Session list, chat thread, composer
    shared/           # Reusable layout primitives and toolbar
  data/               # Mock data for the MVP
  pages/              # Route-level page composition
  services/
    files/            # File service abstraction and mock implementation
    gateway/          # Gateway client abstraction and mock implementation
  stores/             # Dedicated Zustand stores per domain
  types/              # Shared app types
  utils/              # Formatting helpers
```

## State architecture

The app uses separate Zustand stores to keep operator concerns isolated and easy to replace with real integrations:

- `connectionStore`: gateway status, current run, active agent/model, connect/disconnect, global stop action.
- `sessionStore`: session list, selection, search, virtualization window placeholder, mock composer updates.
- `projectsStore`: project list, selected project/file, inspector visibility, file send action.
- `changesStore`: changed files, selected diff, accept/reject/save mock actions.
- `logsStore`: live log entries, level filters, connection diagnostics, mock stream subscription.
- `settingsStore`: gateway URL, theme mode, project roots, advanced toggles.

## Replacing mocks with real integrations

All integration boundaries are isolated behind service modules:

- `src/services/gateway/` contains the typed gateway client and a mock implementation.
- `src/services/files/` contains the typed file-service interface and a mock implementation.
- `TODO:` markers are placed exactly where real WebSocket commands, file reads, diff retrieval, and patch actions should be implemented.

Recommended path to replace mocks:

1. Implement the real WebSocket client in `src/services/gateway/mockGatewayClient.ts` or swap in a production client from `src/services/gateway/index.ts`.
2. Replace file tree and read operations in `src/services/files/mockFileService.ts` with a real file bridge.
3. Feed gateway events into the stores rather than static mock arrays.
4. Persist settings and project roots locally.
5. Add editor save, diff apply, and session attachment actions via the real backend.

## MVP pages

- Home: gateway status, current run, recent sessions/files/errors.
- Sessions: 3-column layout with search/list, chat thread/composer/tool events, and session inspector.
- Projects: project list, project tree, file tabs, editor, diff surface, file inspector.
- Changes: changed file list, diff viewer, accept/reject/save actions.
- Logs: live console with filters and diagnostics.
- Settings: gateway URL, theme toggle, project roots placeholder, advanced settings placeholder.

## Next implementation steps

1. Wire the gateway client to the real OpenClaw WebSocket protocol and push connection/run updates into `connectionStore` and `sessionStore`.
2. Replace mock file access with a Windows-aware bridge that can browse repo roots and load/save file contents safely.
3. Implement real session messaging, streaming token updates, and tool event folding from gateway events.
4. Connect the changes workflow to actual diff/patch APIs so accept/reject/save actions mutate the repo state.
5. Add persistence for settings, recent projects, and recent sessions to improve startup continuity.
