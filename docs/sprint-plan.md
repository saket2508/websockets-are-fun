# Discord-Style Terminal Chat – Sprint Plan

## Overview
- Goal: evolve the starter Bun WebSocket server and Ink client into a Discord-inspired terminal chat with multi-guild/channel support and rich UX.
- Cadence: three focused sprints (~1-2 weeks each) with room to iterate or reprioritize as needed.
- Tooling snapshot: Bun runtime, Bun SQLite, Ink (TypeScript), `zod`, `nanoid`, `string-width`, `marked`, `kleur`, `bun:test`, ESLint/Prettier (or Biome).

## Sprint 1 – Foundation (Server Core)
- Enforce strict TypeScript across repo (convert client to `.tsx`, tighten `tsconfig`).
- Define shared types/DTOs for users, guilds, channels, messages, reactions.
- Implement Bun SQLite schema + migration and seeding scripts for demo data.
- Extend WebSocket server for auth handshake stub, channel routing, history fetch endpoint, command router skeleton.
- Add unit tests for server handlers and shared utilities via `bun:test`.

## Sprint 2 – TUI Structure & Navigation
- Scaffold TypeScript Ink client with centralized state (context + reducer) and reusable WebSocket layer.
- Build Discord-style layout (guild bar, channel list, message pane, member list, composer footer) with theming via `kleur`.
- Implement keyboard navigation (guild/channel switching, command palette, modals) using `useInput`.
- Handle real-time flows: optimistic send, ACK/rollback, typing indicators, history hydration on channel join.

## Sprint 3 – Rich Messaging & UX Polish
- Add Markdown rendering (`marked` + `cli-highlight`) and emoji-safe layout (`string-width`, `slice-ansi`).
- Support reactions, message edits/deletes, slash commands (`/nick`, `/join`, `/leave`, `/thread`, `/dm`, `/help`).
- Display presence, statuses, typing indicators, and error/reconnect toasts.
- Expand test coverage: Ink component tests (`ink-testing-library`), reducers/commands, WebSocket integration; update docs and release checklist.

## Follow-Up Ideas (Post-Sprint)
- Persistent user accounts, DM separation, attachments storage.
- Package client via `bun build`, create container/deployment scripts.
- Telemetry/metrics, configuration UI, plugin system.

> This plan is a living document—adjust scope, reorder tasks, or add items as the project evolves.
