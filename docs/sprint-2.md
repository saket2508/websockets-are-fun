# Sprint 2 – TUI Structure & Navigation

## Goals
- Bring the Ink client up to parity with the server contracts established in Sprint 1.
- Deliver a Discord-inspired terminal layout with live guild/channel navigation.
- Handle optimistic message sending and WebSocket lifecycle (connect, reconnect, hydrate history).

## Backlog
- [x] Establish client state container (context + reducer) with slices for session, guilds, channels, messages, ui.
- [x] Implement WebSocket gateway client that authenticates, receives events, and dispatches to the reducer.
- [x] Build layout scaffolding: guild rail, channel list, message log, member list, composer/footer.
- [x] Wire join/send flows: optimistic message creation, history hydration, ack error handling.
- [x] Support keyboard navigation (guild/channel cycling, message scrolling, command palette stub).
- [x] Cover reducer + gateway handler logic with `bun:test` unit tests.

> Next focus: capture any UX polish ideas for Sprint 3 (markdown, reactions, presence) and tighten documentation for the new navigation flows.

## Progress
- Context-driven state store powers the terminal client and is wired to the gateway dispatcher.
- Discord-style layout renders guild, channel, message, and member panes with focus cycling.
- Optimistic message sending queues pending entries until the server broadcasts the canonical record.
- Scrollable message history with per-channel ACKs and a CTRL+P command palette stub round out Sprint 2 navigation goals.
- Reducer and gateway helpers now have unit tests to lock in optimistic flows and outbound event contracts.

## Notes
- Sequence work so the reducer and gateway client land first; UI panes can render placeholder data until the state is ready.
- Keep gateway handling side-effect free by funnelling server events through typed action creators.
- Treat the WebSocket connection as a service object so we can swap in mocks for tests later.
