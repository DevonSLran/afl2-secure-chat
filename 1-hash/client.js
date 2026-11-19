const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let username = "";

function hashMessage(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function packMessage(text) {
  return `${hashMessage(text)}|${text}`;
}

function unpackMessage(packed) {
  const separator = packed.indexOf("|");
  if (separator === -1) return { hash: null, text: packed };
  return {
    hash: packed.slice(0, separator),
    text: packed.slice(separator + 1),
  };
}

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    console.log(`Welcome, ${username} to the chat`);
    rl.prompt();

    rl.on("line", (message) => {
      if (message.trim()) {
        socket.emit("message", { username, message: packMessage(message) });
      }
      rl.prompt();
    });
  });
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    const { hash, text } = unpackMessage(senderMessage);

    if (hash && hashMessage(text) === hash) {
      console.log(`${senderUsername}: ${text}`);
    } else {
      console.log(`${senderUsername}: ${text}`);
      console.log(
        "   ⚠️  WARNING: this message may have been changed during transmission! (hash does not match)"
      );
    }
    rl.prompt();
  }
});

socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});
