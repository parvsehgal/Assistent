const WebSocket = require("ws");
const http = require("http");

const gptKey = "your Key here";

const server = http.createServer();

const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", (ws) => {
  console.log("Client connected to /Assistant");

  //generate a gpt ws client for our user
  const url =
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  const gptClient = new WebSocket(url, {
    headers: {
      Authorization: "Bearer " + `${gptKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
  //when gpt client gets connected to openai's WebSocket server
  gptClient.on("open", function open() {
    console.log("Connected to gpt WebSocket server.");
    ws.send("your gpt client is ready for u to use");
  });
  //when out gpt client gets a message from the openai server
  gptClient.on("message", (messageRecieved) => {
    const parsedMessage = JSON.parse(messageRecieved.toString());
    ws.send(JSON.stringify(parsedMessage));
  });
  // Handle messages from the client
  ws.on("message", (message) => {
    //we will pass these messages to the gpt client and wait for a response
    const userMessage = Buffer.isBuffer(message) ? message.toString() : message;
    console.log(userMessage);
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: userMessage,
          },
        ],
      },
    };
    gptClient.send(JSON.stringify(event));
    gptClient.send(JSON.stringify({ type: "response.create" }));
  });
});

// Handle upgrades to WebSocket connections
server.on("upgrade", (req, socket, head) => {
  if (req.url === "/Assistant") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Start the server on port 4000
server.listen(4000, () => {
  console.log("WebSocket server is listening on ws://localhost:4000/Assistant");
});
