# OpenClaw Operator UI

A Windows-first React + TypeScript + Vite operator console for OpenClaw. The UI now includes an exploratory real gateway client for the current WebSocket lifecycle, reconnect, and session/message event flow, and now adds a first real local file bridge for configured project roots while keeping an explicit mock fallback when the bridge is unavailable.

## Setup

```bash
npm install
npm run dev
npm run check
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

## Current integration status

- Gateway integration: exploratory-real. `src/services/gateway/realGatewayClient.ts` is the active client and keeps explicit handshake phases, protocol confidence, reconnect handling, and raw payload diagnostics while protocol details are still being confirmed.
- Protocol confidence: partial. The UI distinguishes `verified` signals from exploratory heuristics instead of assuming readiness from any recognized event name.
- File service: real local bridge first. `src/services/files/` now prefers an HTTP-backed local bridge served by the Vite dev server for configured roots, with an explicit mock fallback if that bridge is unavailable.

## Replacing mocks with real integrations

All integration boundaries are isolated behind service modules:

- `src/services/gateway/` contains the active real gateway client plus a mock implementation for fallback/reference work.
- `src/services/files/` contains the typed file-service interface and a mock implementation.
- `TODO(openclaw-protocol):` markers are kept exactly where the real WebSocket command, subscription, and verification schema still needs confirmation.

Recommended path to continue hardening integrations:

1. Confirm the exact OpenClaw gateway handshake, subscription, session-list, send-message, current-run, and stop-run payloads called out by `TODO(openclaw-protocol)` markers.
2. Keep refining session/message reconciliation as more real gateway correlation fields are confirmed.
3. Persist settings and project roots locally.
4. Expand file bridge coverage beyond text-first tree/read/write operations.
5. Add git-aware patch apply/review flows once the local edited-file workflow is stable.

## MVP pages

- Home: gateway status, current run, recent sessions/files/errors.
- Sessions: 3-column layout with search/list, chat thread/composer/tool events, and session inspector.
- Projects: project list, project tree, file tabs, editor, diff surface, file inspector.
- Changes: changed file list, diff viewer, accept/reject/save actions.
- Logs: live console with filters and diagnostics.
- Settings: gateway URL, theme toggle, project roots placeholder, advanced settings placeholder.

## Quality scripts

- `npm run typecheck`: TypeScript type-only validation.
- `npm run lint`: ESLint over the current source tree.
- `npm run check`: Runs `typecheck`, `lint`, and `build` in sequence.

## Next implementation steps

1. Replace exploratory handshake guesses with confirmed OpenClaw protocol messages and acknowledgement handling.
2. Replace mock file access with a Windows-aware bridge that can browse repo roots and load/save file contents safely.
3. Expand verified protocol coverage for message/tool events once the gateway echoes stable correlation identifiers.
4. Connect the changes workflow to actual diff/patch APIs so accept/reject/save actions mutate the repo state.
5. Add persistence for settings, recent projects, and recent sessions to improve startup continuity.
