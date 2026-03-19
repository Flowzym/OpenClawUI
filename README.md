# OpenClaw Operator UI

A Windows-first React + TypeScript + Vite operator console for OpenClaw. The UI includes an exploratory real gateway client for the current WebSocket lifecycle, reconnect, and session/message event flow, plus an explicit local file runtime mode for configured project roots.

## Setup

```bash
npm install
npm run dev
npm run check
```

Default local gateway target:

- `ws://127.0.0.1:18789`

## Runtime model

### Supported file runtime today

The current real filesystem integration is the **local Vite bridge runtime**:

- Run the UI with `npm run dev`.
- The browser talks to `/api/file-bridge/*` on the same local Vite dev server.
- `vite.fileBridge.ts` translates configured Windows paths such as `C:/repos/OpenClawUI` into WSL-visible paths when needed.
- The UI only treats file access as real when `/api/file-bridge/status` responds with the expected bridge headers.

This is the current supported local runtime mode for real project/file access. It is **not** a generic production backend and it is **not** active in every runtime.

### What happens in preview/build or when the bridge is absent

- `vite.fileBridge.ts` is registered with `apply: 'serve'`, so the real bridge only runs in the local Vite dev server lifecycle.
- A production build or `vite preview` does not expose the local file bridge unless another runtime is added separately.
- When the browser cannot verify the bridge, the UI switches to an explicit **mock fallback** mode and labels that mode in Projects and Settings.
- In mock fallback mode, project/file operations use in-memory demo data instead of pretending that real local filesystem access is active.

### Recommended local environment

Current intended usage is local Windows + WSL development:

1. Run the UI inside the repo with `npm run dev`.
2. Keep configured project roots pointed at local Windows repo paths that are reachable from WSL.
3. Use the Projects page/runtime banner to confirm that the app is in `Local dev bridge active` mode before relying on real file reads or writes.

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
    files/            # File service abstraction and runtime-aware bridge selection
    gateway/          # Gateway client abstraction and mock implementation
  stores/             # Dedicated Zustand stores per domain
  types/              # Shared app types
  utils/              # Formatting helpers
```

## State architecture

The app uses separate Zustand stores to keep operator concerns isolated and easy to replace with real integrations:

- `connectionStore`: gateway status, current run, active agent/model, connect/disconnect, global stop action.
- `sessionStore`: session list, selection, search, virtualization window placeholder, mock composer updates.
- `projectsStore`: project list, selected project/file, inspector visibility, initialization, and file send action.
- `changesStore`: changed files, selected diff, accept/reject/save mock actions.
- `logsStore`: live log entries, level filters, connection diagnostics, mock stream subscription.
- `settingsStore`: gateway URL, theme mode, project roots, advanced toggles.

## Current integration status

- Gateway integration: exploratory-real. `src/services/gateway/realGatewayClient.ts` is the active client and keeps explicit handshake phases, protocol confidence, reconnect handling, and raw payload diagnostics while protocol details are still being confirmed.
- Protocol confidence: partial. The UI distinguishes `verified` signals from exploratory heuristics instead of assuming readiness from any recognized event name.
- File service: runtime-aware. `src/services/files/` probes the local Vite bridge explicitly, uses the bridge only when it identifies itself as `local-dev-bridge`, and otherwise enters an explicit mock fallback mode.

## Replacing mocks with real integrations

All integration boundaries are isolated behind service modules:

- `src/services/gateway/` contains the active real gateway client plus a mock implementation for fallback/reference work.
- `src/services/files/` contains the typed file-service interface, the local Vite-backed bridge client, and the explicit mock fallback service.
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
- Projects: project list, project tree, file tabs, editor, diff surface, runtime banner, and file inspector.
- Changes: changed file list, diff viewer, accept/reject/save actions.
- Logs: live console with filters and diagnostics.
- Settings: gateway URL, theme toggle, project roots, runtime mode, and advanced settings placeholders.

## Quality scripts

- `npm run typecheck`: TypeScript type-only validation.
- `npm run lint`: ESLint over the current source tree.
- `npm run check`: Runs `typecheck`, `lint`, and `build` in sequence.

## Next implementation steps

1. Replace exploratory handshake guesses with confirmed OpenClaw protocol messages and acknowledgement handling.
2. Add a non-Vite runtime only when there is a real backend/runtime contract for local file access.
3. Expand verified protocol coverage for message/tool events once the gateway echoes stable correlation identifiers.
4. Connect the changes workflow to actual diff/patch APIs so accept/reject/save actions mutate the repo state.
5. Add persistence for settings, recent projects, and recent sessions to improve startup continuity.
