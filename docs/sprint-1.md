# Sprint 1 – Foundation Deliverables

This sprint established the groundwork for a Discord-style terminal chat. The bullets below capture the key areas.

## TypeScript & Client Setup
- Enforced strict TypeScript across the repo (`tsconfig.json`) and converted the Ink client to `client.tsx` with typed keyboard handling and WebSocket lifecycle management.
- Updated scripts in `package.json` so `bun run client.tsx`, `bunx tsc --noEmit`, and future DB tasks run consistently.

## Shared Contracts & Mapping Layer
- Authored shared DTOs in `src/shared/types.ts` for users, guilds, channels, messages, reactions, and gateway events.
- Added `src/server/models.ts` to translate raw SQLite rows into those DTOs while normalising timestamps and parsing CSV role lists.

## Database Schema & Seeding
- Created `src/server/database.ts` to open the Bun SQLite connection, enable WAL/foreign keys, and apply the initial schema migration.
- Implemented `scripts/seed.ts` for reproducible demo data used both locally and by tests.

## Repository & WebSocket Server
- Built a repository layer (`src/server/repository.ts`) that encapsulates session auth, access checks, history fetching, and message insertion.
- Reworked `index.ts` to deliver guest auth, channel history HTTP endpoints, and structured WebSocket events (`connection_ack`, `guild_bootstrap`, `history_batch`, `message_created`, etc.).

## Testing
- Added `tests/repository.test.ts` using `bun:test` to exercise guest sessions, history retrieval, message persistence, and bootstrap bundling with an in-memory database.

## CLI & Tooling
- Added utility scripts for migrations (`bun run src/server/database.ts --migrate`) and seeding (`bun run scripts/seed.ts`).
- Updated `.gitignore` to keep generated SQLite files out of version control while tracking `docs/` markdown notes.

## Next Steps (Guidance for Sprint 2)
- Introduce a richer state store in the client to consume the new gateway events.
- Flesh out command routing (`/join`, `/nick`, `/thread`) and optimistic message handling.
- Start modelling navigation panes (guild/channel lists) in Ink using the new DTOs.

