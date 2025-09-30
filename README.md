# Discord-Style Terminal Chat (Bun + Ink)

A Discord-inspired chat experience that runs entirely in your terminal. The Bun WebSocket server streams typed gateway events from a SQLite backing store, while an Ink-powered client renders guild/channel rails, live message feeds, optimistic messaging, reactions, and typing presence.

## Current Feature Set

- **Rich terminal UI** – guild rail, channel list, message pane, and member list with keyboard-led focus cycling.
- **Optimistic messaging** – send messages instantly; resolve with server ACKs or surface inline errors.
- **Markdown & emoji renderer** – headings, lists, code fences, and multi-codepoint emoji render cleanly in the TUI.
- **Reactions & quick help** – `/react <emoji> [messageId]` toggles reactions; `CTRL+P` opens a contextual shortcut sheet.
- **Inline edits & deletes** – `/edit` and `/delete` commands (or `E`/`X` shortcuts) flow through optimistic reconciliation.
- **Typing indicators** – the server broadcasts start/stop signals with auto-expiring timers, and the client shows who’s composing in real time.
- **Typed contracts & tests** – shared DTOs keep server/client aligned; repository, reducer, gateway, and renderer logic ship with `bun:test` coverage.

## Quick Start

1. **Install dependencies**
   ```bash
   bun install
   ```
2. **Apply migrations & seed demo data** (idempotent)
   ```bash
   bun run src/server/database.ts --migrate
   bun run scripts/seed.ts
   ```
3. **Run the WebSocket/API server**
   ```bash
   bun run index.ts
   ```
4. **Launch the Ink client** in a separate terminal
   ```bash
   bun run client.tsx
   ```
   Each terminal negotiates a guest account and auto-joins the seeded guild/channel set.
5. _(Optional)_ **Develop with hot reload**
   ```bash
   bun --hot run index.ts
   ```

## Operating the Client

- `TAB` / `SHIFT+TAB` cycle focus across guilds → channels → messages → members → composer.
- `↑`/`↓` scroll history; `ENTER` focuses the composer and submits messages.
- `CTRL+P` toggles the quick command overlay; `CTRL+C` exits the client.
- `/react <emoji> [messageId]` toggles a reaction; defaults to the selected/latest message when omitted.
- Press `E` (edit) or `X` (delete) in the message pane to act on the highlighted row; the composer pre-fills for edits.
- Composer input is emoji-safe and publishes throttled typing signals so peers can see activity.

## Architecture Overview

### Server (`index.ts`, `src/server/*`)

- `Bun.serve()` powers REST + WebSocket endpoints, handling guest auth, history fetches, live messaging, reactions, and typing presence.
- Repository layer (`src/server/repository.ts`) encapsulates database access for users, sessions, guild membership, messages, and reactions.
- SQLite schema migrations (`src/server/database.ts`) and seed script (`scripts/seed.ts`) bootstrap demo data.
- Gateway payloads are serialized from shared DTOs to keep the client strongly typed.

### Client (`client.tsx`, `src/client/*`)

- Ink components (`GuildRail`, `ChannelList`, `MessagePane`, `MemberList`, `Composer`) compose the Discord-style terminal layout.
- Central reducer/context (`src/client/state.tsx`) tracks session metadata, navigation, optimistic mutations, reactions, and typing state.
- WebSocket helper (`src/client/gateway.ts`) manages connection lifecycle, dispatching gateway events into the reducer.
- Lightweight Markdown renderer (`src/client/markdown.ts`) adapts content to ANSI width constraints.

### Shared Contracts (`src/shared/types.ts`)

- DTOs define users, guilds, channels, messages, reactions, presence, and gateway events for end-to-end type safety.

## Testing & Tooling

- Run the suite: `bun test`
- Type-check: `bunx tsc --noEmit` or `bun run --check index.ts`
- Re-seed demo data at any time: `bun run scripts/seed.ts`

Documentation lives under `docs/` (`sprint-plan.md`, `sprint-1.md`, `sprint-2.md`, `sprint-3.md`).

## Future Plans (on hold)

When development resumes, the following backlog items are queued up:

- **Slash command router** – canonical handling for `/nick`, `/join`, `/leave`, `/thread`, `/dm`, `/help` with structured feedback.
- **Presence polish** – user status badges, richer typing/presence toasts, and reconnection messaging.
- **Timeline enhancements** – channel separators, placeholder entries during reconnects, and improved message grouping.
- **UI theming tweaks** – expanded colour palettes, additional panel contrast, and optional high-contrast mode.
- **Test coverage** – Ink component tests, command handlers, and integration harnesses.
- **Packaging & deployability** – bundle the client via `bun build`, scriptable seeds, and production deployment docs.

Built with ❤️ using Bun, Ink, TypeScript, and SQLite.
