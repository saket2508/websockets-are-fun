import React, { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, render, useInput } from "ink";
import kleur from "kleur";

const WS_URL = "ws://localhost:3000";

type InkKey = {
  upArrow?: boolean;
  downArrow?: boolean;
  leftArrow?: boolean;
  rightArrow?: boolean;
  return?: boolean;
  escape?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  tab?: boolean;
  backspace?: boolean;
  delete?: boolean;
};

type ConnectionStatus = "Connecting" | "Connected" | "Disconnected";

type SocketEvent = {
  data: unknown;
};

function App(): ReactElement {
  const [status, setStatus] = useState<ConnectionStatus>("Connecting");
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = () => {
      setStatus("Connected");
    };

    socket.onclose = () => {
      setStatus("Disconnected");
      process.exit(0);
    };

    socket.onerror = (error) => {
      console.error("WebSocket error", error);
    };

    socket.onmessage = (event: SocketEvent) => {
      const rawData = typeof event.data === "string" ? event.data : String(event.data);
      setMessages((prev) => [...prev, rawData]);
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, []);

  useInput((char: string, key: InkKey) => {
    if (key.ctrl && char === "c") {
      wsRef.current?.close();
      process.exit(0);
    }

    if (key.return) {
      const trimmed = input.trim();
      if (trimmed.length > 0) {
        wsRef.current?.send(trimmed);
        setInput("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (char.length > 0) {
      setInput((prev) => prev + char);
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray">
      <Box>
        <Text>
          Status: {status === "Connected" ? kleur.green(status) : kleur.yellow(status)}
        </Text>
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {messages.map((msg, index) => (
          <Text key={index}>{msg}</Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color="green">{"> "}{input}</Text>
      </Box>
    </Box>
  );
}

render(<App />);
