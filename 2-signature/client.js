const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto");

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let registeredUsername = "";
let username = "";
const users = new Map();

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function signMessage(text) {
  return crypto.sign("sha256", Buffer.from(text), privateKey).toString("base64");
}

function verifyMessage(text, signature, senderPublicKey) {
  try {
    return crypto.verify(
      "sha256",
      Buffer.from(text),
      senderPublicKey,
      Buffer.from(signature, "base64")
    );
  } catch (err) {
    return false;
  }
}

function packMessage(text) {
  return `${signMessage(text)}|${text}`;
}

function unpackMessage(packed) {
  const separator = packed.indexOf("|");
  if (separator === -1) return { signature: null, text: packed };
  return {
    signature: packed.slice(0, separator),
    text: packed.slice(separator + 1),
  };
}

socket.on("connect", () => {
  console.log("Connected to the server");

  rl.question("Enter your username: ", (input) => {
    username = input;
    registeredUsername = input;
    console.log(`Welcome, ${username} to the chat`);

    socket.emit("registerPublicKey", {
      username,
      publicKey,
    });
    rl.prompt();

    rl.on("line", (message) => {
      let match;
      if (message.trim()) {
        if ((match = message.match(/^!impersonate (\w+)$/))) {
          username = match[1];
          console.log(`Now impersonating as ${username}`);
        } else if (message.match(/^!exit$/)) {
          username = registeredUsername;
          console.log(`Now you are ${username}`);
        } else {
          socket.emit("message", { username, message: packMessage(message) });
        }
      }
      rl.prompt();
    });
  });
});

socket.on("init", (keys) => {
  keys.forEach(([user, key]) => users.set(user, key));
  console.log(`\nThere are currently ${users.size} users in the chat`);
  rl.prompt();
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} join the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage } = data;
  if (senderUsername !== username) {
    const { signature, text } = unpackMessage(senderMessage);
    const senderPublicKey = users.get(senderUsername);

    if (!senderPublicKey) {
      console.log(`${senderUsername}: ${text}`);
      console.log(
        `   ⚠️  WARNING: "${senderUsername}" has no registered public key, this user may be fake!`
      );
    } else if (signature && verifyMessage(text, signature, senderPublicKey)) {
      console.log(`${senderUsername}: ${text}`);
    } else {
      console.log(`${senderUsername}: ${text}`);
      console.log(
        `   ⚠️  WARNING: this user is fake! The signature does not match ${senderUsername}'s public key.`
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
