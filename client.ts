
import kleur from "kleur";
import prompts from "prompts";

const ws = new WebSocket("ws://localhost:3000");

ws.onopen = () => {
  console.log(kleur.green("Connected to the chat server!"));
  // Start the input loop once connected
  main(); 
};

ws.onmessage = (event) => {
  // We need to clear the current line where the user might be typing
  // and then print the message. This is a simple way to handle UI.
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  console.log(event.data);
};

ws.onclose = () => {
  console.log(kleur.red("Disconnected from the server."));
  process.exit(0);
};

ws.onerror = (error) => {
  console.error(kleur.red("WebSocket error:"), error);
  process.exit(1);
};

async function main() {
  while (ws.readyState === WebSocket.OPEN) {
    const response = await prompts({
      type: "text",
      name: "message",
      message: "", // No message label to keep it clean
      // A little trick to make the input line look nice
      prefix: kleur.bold().cyan("> "), 
    });

    if (response.message && response.message.trim() !== "") {
      ws.send(response.message);
    } else if (response.message === undefined) {
        // User pressed Ctrl+C
        ws.close();
        break;
    }
    
    // A small delay to prevent typing indicators from firing too often
    // In a real client, we would send the typing indicator here based on input events
    // For now, we'll just send the message.
  }
}
