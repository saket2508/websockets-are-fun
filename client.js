import React, { useState, useEffect } from 'react';
import { render, Box, Text, useInput } from 'ink';
import kleur from 'kleur';

const ws = new WebSocket("ws://localhost:3000");

const App = () => {
  const [status, setStatus] = useState('Connecting...');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // useEffect hook to manage the WebSocket lifecycle
  useEffect(() => {
    ws.onopen = () => {
      setStatus('Connected');
    };

    ws.onclose = () => {
      setStatus('Disconnected');
      process.exit(0);
    };

    ws.onmessage = (event) => {
      setMessages(prev => [...prev, event.data.toString()]);
    };

    // Cleanup on component unmount
    return () => {
      ws.close();
    };
  }, []);

  // useInput hook to handle user keyboard input
  useInput((char, key) => {
    if (key.return) { // Enter key
      if (input.trim() !== '') {
        ws.send(input);
        setInput('');
      }
      return;
    }

    if (key.ctrl && char === 'c') {
      ws.close();
      process.exit(0);
    }

    if (key.backspace || key.delete) {
      setInput(prev => prev.slice(0, -1));
    } else {
      setInput(prev => prev + char);
    }
  });

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="gray" >
      <Box>
        <Text>
          Status: {status === 'Connected' ? kleur.green(status) : kleur.yellow(status)}
        </Text>
      </Box>
      < Box flexDirection="column" marginTop={1} >
        {
          messages.map((msg, index) => (
            <Text key={index} > {msg} </Text>
          ))
        }
      </Box>
      < Box marginTop={1} >
        <Text>{'> '}{input} </Text>
      </Box>
    </Box>
  );
};

render(<App />);
