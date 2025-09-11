type WebsocketData = {
  username: string
};

// Import ServerWebSocket type from Bun
type ServerWebSocket<T = any> = {
  data: T;
  send(message: string | ArrayBuffer | Uint8Array): number;
  close(code?: number, reason?: string): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  publish(topic: string, message: string | ArrayBuffer | Uint8Array): void;
  isSubscribed(topic: string): boolean;
};

console.log("Attempting to start the server...");

// Helper function to generate a random username
function generateRandomName() {
  const adjectives = ["Agile", "Bright", "Creative", "Dapper", "Eager", "Fearless", "Gentle", "Happy", "Icy", "Jolly", "Keen", "Lazy", "Mystic", "Noble", "Olive", "Proud", "Quiet", "Royal", "Silly", "True", "Unique", "Vivid", "Witty", "Yellow", "Zesty"];
  const nouns = ["Ape", "Bear", "Cat", "Dog", "Eagle", "Fox", "Goat", "Heron", "Impala", "Jaguar", "Koala", "Lion", "Monkey", "Narwhal", "Owl", "Panda", "Quail", "Rabbit", "Snake", "Tiger", "Urchin", "Viper", "Walrus", "Yak", "Zebra"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}`;
}

const server = Bun.serve({
  port: 3000,
  error(error) {
    console.error("Server error:", error);
    return new Response("Uh oh! An error occurred.", { status: 500 });
  },
  fetch(req, server) {
    const success = server.upgrade(req, {
      data: {
        username: generateRandomName(),
      },
    });
    if (success) {
      return; // Bun automatically handles the response
    }

    return new Response("Welcome to the chat! Please connect with a WebSocket client.");
  },
  websocket: {
    open(ws: ServerWebSocket<WebsocketData>) {
      console.log(`${ws.data.username} has entered the chat`);
      ws.subscribe("the-chat-room");
      // Broadcast to all clients in the room except the new one
      ws.publish("the-chat-room", `${ws.data.username} has entered the chat`);
      ws.send(`Welcome! You are ${ws.data.username}`);
    },
    message(ws: ServerWebSocket<WebsocketData>, message) {
      const chatMessage = `${ws.data.username}: ${message}`;
      server.publish("the-chat-room", chatMessage);
    },
    close(ws: ServerWebSocket<WebsocketData>) {
      console.log(`${ws.data.username} has left the chat`);
      server.publish("the-chat-room", `${ws.data.username} has left the chat`);
      ws.unsubscribe("the-chat-room");
    },
  },
});

console.log(`Server started. Listening on http://localhost:${server.port}`);
