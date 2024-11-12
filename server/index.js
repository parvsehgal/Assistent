const WebSocket = require("ws");
const http = require("http");
const helper = require("./utils/audiofunctions.js");
const gptKey = "your-Api-Key";

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
    const parsedData = JSON.parse(data);
    console.log(parsedData.type);
    if (parsedData.type === "response.audio.delta") {
      const pcmData = helper.base64ToArrayBuffer(parsedData.delta);
      const sampleRate = 24000;
      const header = helper.createWavHeader(sampleRate, pcmData.byteLength);
      const finalAudioBuffer = helper.concatenateWavHeaderAndData(
        header,
        pcmData,
      );
      ws.send(finalAudioBuffer);
    } else {
      ws.send(JSON.stringify(parsedData));
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
