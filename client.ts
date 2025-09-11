import chalk from 'chalk';
import readline from 'readline';
import WebSocket from 'ws';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const socket = new WebSocket("ws://localhost:3000");

socket.on('open', () => {
  console.log(chalk.green('🎉 Connected to chat server!'));
  console.log(chalk.gray('Commands: /help, /quit'));
  showPrompt();
});

socket.on('message', (data: WebSocket.RawData) => {
  console.log('\n' + chalk.blue('📨 ') + data.toString());
  showPrompt();
});

socket.on('error', (error: Error) => {
  console.error(chalk.red('WebSocket error:'), error.message);
});

socket.on('close', () => {
  console.log(chalk.yellow('Disconnected from server'));
  rl.close();
  process.exit(0);
});

function showPrompt() {
  rl.question(chalk.cyan('You: '), (input: string) => {
    const trimmedInput = input.trim();

    if (trimmedInput.startsWith('/')) {
      handleCommand(trimmedInput);
    } else if (trimmedInput) {
      socket.send(trimmedInput);
    } else {
      showPrompt(); // Empty input, show prompt again
    }
  });
}

function handleCommand(cmd: string) {
  const [command] = cmd.slice(1).split(' ');

  switch (command) {
    case 'quit':
    case 'exit':
      console.log(chalk.yellow('Goodbye! 👋'));
      socket.close();
      rl.close();
      break;

    case 'help':
      console.log(chalk.yellow('\n📚 Available commands:'));
      console.log('   /quit or /exit - Exit chat');
      console.log('   /help - Show this help');
      console.log('   /clear - Clear screen');
      showPrompt();
      break;

    case 'clear':
      console.clear();
      showPrompt();
      break;

    default:
      console.log(chalk.red(`❌ Unknown command: ${command}`));
      console.log(chalk.gray('Type /help for available commands'));
      showPrompt();
  }
}

// Handle Ctrl+C gracefully
rl.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Goodbye!'));
  socket.close();
  rl.close();
  process.exit(0);
});
