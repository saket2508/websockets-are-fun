# AGENTS.md - Bun Chat App

## Commands
- **Install**: `bun install`
- **Run**: `bun run index.ts` or `bun --hot ./index.ts` (with HMR)
- **Test**: `bun test` (for test files using `import { test, expect } from "bun:test"`)
- **Type Check**: `bun run --check index.ts` (TypeScript validation)
- **Single Test**: `bun test <test-file>` (e.g., `bun test chat.test.ts`)

## Code Style Guidelines

### TypeScript & Imports
- Use strict TypeScript with ESNext target
- Define types at file top (e.g., `type WebsocketData = { username: string }`)
- Use modern import syntax: `import { createRoot } from "react-dom/client"`
- Prefer named exports over default exports

### Bun-Specific Patterns
- Use `Bun.serve()` for HTTP/WebSocket servers (not Express)
- Use `Bun.file()` for file operations (not node:fs)
- Use `WebSocket` built-in (not ws library)
- Use HTML imports for frontend: `<script type="module" src="./frontend.tsx">`

### Naming & Structure
- camelCase for variables/functions: `generateRandomName()`
- PascalCase for types: `WebsocketData`
- Helper functions before main logic
- Clear error handling with try/catch blocks

### Error Handling
- Use try/catch for JSON parsing and async operations
- Log errors with `console.error()` and descriptive messages
- Return appropriate HTTP status codes in error responses

### Testing
- Use `bun:test` framework: `import { test, expect } from "bun:test"`
- Test files should end with `.test.ts`
- Focus on behavior testing over implementation details

## Cursor Rules
- Always use Bun instead of Node.js, npm, pnpm, or Vite
- Prefer Bun APIs: `Bun.serve()`, `Bun.file()`, `Bun.sql()` over third-party libraries
- Use HTML imports for frontend development instead of bundlers