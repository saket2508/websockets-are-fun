# Discord-Style Terminal Chat (Bun + Ink)

A Discord-inspired real-time chat experience that runs entirely in the terminal. The Bun WebSocket server streams gateway events from a SQLite data model, while an Ink-powered client renders guild/channel panes, live message feeds, and rich composer tooling.

## Feature Highlights
- 🖥️ **Discord-style layout** – guild rail, channel list, member list, and a scrollable message pane with focus cycling.
- ⚡ **Bun WebSocket gateway** – typed events for connection ACKs, guild bootstrap, history batches, message creates, and reaction updates.
- 💾 **SQLite-backed data** – migrations and seed scripts provide guilds, channels, users, and starter conversation history.
- ✍️ **Optimistic messaging** – messages appear instantly while awaiting server ACKs, then reconcile against canonical payloads.
- 📝 **Markdown & emoji rendering** – headings, lists, inline/code blocks, and multi-codepoint emoji render correctly within the TUI.
- 😀 **Reactions & quick help** – `/react <emoji> [messageId]` toggles reactions with optimistic state; `CTRL+P` opens a quick command overlay.
- ✂️ **Inline edits & deletes** – `/edit [messageId] <text>` and `/delete [messageId]` apply optimistic updates that reconcile with server confirmations.
- ✅ **Typed contracts & tests** – shared DTOs, repository logic, gateway reducer, and markdown renderer all ship with `bun:test` coverage.

## Getting Started
1. Install dependencies:
   ```bash
   bun install
   ```
2. Prepare the database (idempotent):
   ```bash
   bun run src/server/database.ts --migrate
   bun run scripts/seed.ts
   ```
3. Start the WebSocket/API server:
   ```bash
   bun run index.ts
   ```
4. In a new terminal, launch the Ink client:
   ```bash
   bun run client.tsx
   ```
   Each client window negotiates a guest session and will join the seeded guilds/channels automatically.
5. (Optional) Enable hot reload while working on the server:
   ```bash
   bun --hot run index.ts
   ```

## Working in the Terminal Client
- `TAB` / `SHIFT+TAB` cycle focus across guilds → channels → messages → members → composer.
- `↑`/`↓` scroll message history; `ENTER` focuses the composer and sends messages.
- `CTRL+P` toggles the quick command overlay; `CTRL+C` exits the client.
- `/react <emoji> [messageId]` toggles a reaction (defaults to the selected/latest message when omitted).
- Press `E` in the message pane (or run `/edit`) to prefill the composer with your selected message, then ENTER saves; press `X` or `/delete` to remove your own message.
- New composer input is emoji-safe, so paste or type complex emoji without breaking layout.

## Architecture
### Server (`index.ts`, `src/server/*`)
- Uses `Bun.serve()` to expose HTTP endpoints (guest auth, history) and a WebSocket gateway.
- Repository layer (`src/server/repository.ts`) encapsulates session auth, channel access, history queries, message insertion, and reaction toggling.
- SQLite schema and migrations live in `src/server/database.ts`; seed data is generated via `scripts/seed.ts`.
- Row-to-DTO mapping and shared contracts ensure the gateway emits strongly typed payloads consumed by the client.

### Client (`client.tsx`, `src/client/*`)
- Ink components render the Discord-style layout: `GuildRail`, `ChannelList`, `MessagePane`, `MemberList`, and `Composer`.
- Centralised reducer/state context (`src/client/state.tsx`) manages session info, guild/channel selection, optimistic messages, and reaction state.
- `src/client/gateway.ts` manages the WebSocket lifecycle, dispatching typed gateway events into the reducer.
- `src/client/markdown.ts` provides a lightweight renderer tuned for terminal width handling.

### Shared Contracts (`src/shared/types.ts`)
- DTOs model users, guilds, channels, messages, reactions, and gateway events, keeping the server, client, and tests aligned.

## Tooling & Tests
- Run the full test suite with `bun test` (covers repositories, gateway reducer, markdown renderer, and optimistic flows).
- Type-check the project via `bun run typecheck`.
- Additional scripts: `bun run scripts/seed.ts` (reset demo content) and `bun run src/server/database.ts --migrate` (apply schema changes).

## Documentation
- Sprint notes: `docs/sprint-1.md`, `docs/sprint-2.md`, `docs/sprint-3.md`
- High-level plan: `docs/sprint-plan.md`

## Roadmap & Enhancements
Plans from the sprint backlog highlight the next features to tackle:
- Message edit/delete workflows with optimistic reconciliation.
- Full slash-command routing (`/nick`, `/join`, `/leave`, `/thread`, `/dm`, `/help`) and error feedback.
- Presence badges, typing indicators, and reconnection toasts to surface live status.
- Expanded testing (Ink component coverage, command handlers) and documentation polish.
- Longer-term ideas: persistent user accounts, attachments, packaging the client, telemetry/metrics, and extensibility hooks.

---
Built with ❤️ on Bun, Ink, and TypeScript.
