# Bun WebSocket Chat App

A real-time terminal chat application built with Bun's WebSocket server and a Node.js client.

## Features

- 🚀 **High-performance**: Built with Bun's native WebSocket implementation (7x faster than Node.js + ws)
- 💬 **Real-time messaging**: Instant message delivery with pub/sub system
- 🎨 **Rich terminal UI**: Colored output with emoji support
- 🖥️ **Terminal client**: Interactive command-line interface
- 📝 **Commands**: `/help`, `/quit`, `/clear` for enhanced UX
- 🔄 **Auto-reconnection**: Graceful handling of connection issues

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) installed on your system

### Installation
```bash
# Install dependencies
bun install
```

### Running the Application

#### Option 1: Run Server and Client Together
```bash
# Terminal 1: Start the server
bun run server

# Terminal 2: Connect with client
bun run client
```

#### Option 2: Development Mode (with hot reload)
```bash
# Start server with hot reload
bun run dev
```

### Testing with Multiple Clients
Open multiple terminals and run `bun run client` in each to test the chat functionality.

## Architecture

### Server (`index.ts`)
- **Bun.serve()**: High-performance HTTP/WebSocket server
- **Pub/Sub System**: Topic-based message broadcasting
- **Random Usernames**: Auto-generated fun usernames for each connection
- **Type Safety**: Full TypeScript support with custom WebSocket data types

### Client (`client.ts`)
- **WebSocket Connection**: Connects to `ws://localhost:3000`
- **Interactive UI**: readline-based prompt system
- **Command System**: Slash commands for enhanced functionality
- **Rich Formatting**: Colored output with chalk
- **Graceful Shutdown**: Proper cleanup on exit

## Available Commands

- `/help` - Show available commands
- `/quit` or `/exit` - Exit the chat
- `/clear` - Clear the terminal screen

## How It Works

1. **Server Startup**: `Bun.serve()` starts on port 3000
2. **Client Connection**: WebSocket upgrade from HTTP to WS protocol
3. **User Registration**: Server assigns random username to each connection
4. **Message Flow**: Client → Server → Broadcast to all subscribers
5. **Pub/Sub**: Uses Bun's native publish-subscribe for efficient message distribution

## Development

### Type Checking
```bash
bun run typecheck
```

### Project Structure
```
bun-chat-app/
├── index.ts          # WebSocket server
├── client.ts         # Terminal client
├── package.json      # Dependencies and scripts
├── tsconfig.json     # TypeScript configuration
└── README.md         # This file
```

## Performance

- **7x faster** than Node.js + ws library
- **Native WebSocket implementation** in Bun
- **Optimized pub/sub system** for high concurrency
- **Memory efficient** with single handler per server

## Next Steps

Consider adding these features:
- User authentication and persistent usernames
- Private messaging between users
- Message history with SQLite database
- File sharing capabilities
- Multiple chat rooms/channels
- Voice message support
- Mobile app companion

---

Built with ❤️ using [Bun](https://bun.sh) - the fast JavaScript runtime.
