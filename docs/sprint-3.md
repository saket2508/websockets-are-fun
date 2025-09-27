# Sprint 3 – Rich Messaging & UX Polish

## Goals
- Render chat content with Markdown/emoji support while preserving terminal layout accuracy.
- Introduce interactive reactions and edit/delete flows with optimistic updates.
- Expand command handling (`/nick`, `/join`, `/leave`, `/thread`, `/dm`, `/help`) and surface presence/typing indicators.
- Harden the UX with reconnection toasts and targeted tests/documentation.

## Ticket Backlog
- [x] **Markdown & Emoji Rendering** – render emphasis, inline code, lists, code blocks, and links within the Ink message pane with accompanying unit tests.
- [x] **Reaction Events & UI** – extend gateway schema, reducer, and Ink components to show reaction counts, handle `/react` toggles, and surface a quick help overlay.
- [x] **Edit/Delete Workflow** – add server support plus client affordances for editing/deleting messages; ensure optimistic reconciliation.
- [ ] **Slash Command Routing** – implement command parser/executor for `/nick`, `/join`, `/leave`, `/thread`, `/dm`, `/help` with feedback/errors.
- [x] **Presence & Typing Indicators** – surface typing notifications in the TUI and prep the gateway for richer presence cues.
- [ ] **Testing & Docs Polish** – add Ink component tests (`ink-testing-library`), reducer/command coverage, and update sprint docs/user guides.

> Status will be tracked here as we close tickets.

## Progress
- Added an inline Markdown renderer and updated the message pane to display formatted content with accompanying unit tests.
- Reaction toggling now works end-to-end (server ➜ client reducer ➜ Ink UI) with composer `/react` shortcuts and message selection cues.
- Message edits and deletes flow optimistically via `/edit` and `/delete`, reconciling against server `message_updated`/`message_deleted` events with reducer coverage and repository tests.
- Typing presence now propagates over the gateway with auto-expiring signals, throttled composer emissions, reducer coverage, and a message pane indicator that highlights who is actively writing.
