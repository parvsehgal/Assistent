const WebSocket = require("ws");
const http = require("http");

const gptKey = "your-API-Key";

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
  gptClient.on("message", (data) => {
    // Convert Buffer to string if data is binary
    let messageStr;
    if (Buffer.isBuffer(data)) {
      messageStr = data.toString("utf-8");
      ws.send(messageStr);
    } else if (typeof data === "string") {
      ws.send(data);
    } else {
      console.warn("Received unsupported data type from OpenAI:", typeof data);
    }
  });
  // Handle messages from the client
  ws.on("message", (message) => {
    try {
      const event = JSON.parse(message);
      // Forward the event to OpenAI's WebSocket
      gptClient.send(JSON.stringify(event));
    } catch (e) {
      console.error("Error parsing message from client:", e);
      // Optionally, send an error back to the client
      const errorEvent = {
        type: "error",
        error: {
          message: "Invalid JSON format sent to server.",
          details: e.message,
        },
      };
      ws.send(JSON.stringify(errorEvent));
    }
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
