import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [words, setWords] = useState("");
  // Function to connect to the WebSocket server
  const connectToAssistant = () => {
    // Create a new WebSocket connection
    const ws = new WebSocket("ws://localhost:4000/Assistant");

    // When the connection is opened
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const message = event.data;
      // Check if the message looks like JSON
      if (isJsonString(message)) {
        try {
          const jsonMessage = JSON.parse(message);
          console.log("Parsed JSON message:", jsonMessage);
          if (jsonMessage.type === "response.done") {
            console.log(message);
            setWords(jsonMessage.response.output[0].content[0].transcript);
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      } else {
        console.warn("Received non-JSON message:", message);
        // Handle non-JSON messages if needed
      }
    };

    // Utility function to check if a string is valid JSON
    const isJsonString = (str) => {
      try {
        JSON.parse(str);
        return true;
      } catch (error) {
        return false;
      }
    };
    // When the connection is closed
    ws.onclose = () => {
      console.log("WebSocket connection closed");
      setIsConnected(false);
    };

    // Handle errors
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    setSocket(ws);
  };

  // Function to send a message to the WebSocket server
  const sendMessage = (message) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      console.log("Sent message:", message);
    } else {
      console.error("WebSocket is not open.");
    }
  };
  //function to play the audio
  const playAudio = () => {
    console.log("the audio is being played");
    console.log(words);
    const utterance = new SpeechSynthesisUtterance(words);

    // Optionally, you can set properties like pitch, rate, and voice
    utterance.pitch = 1; // Default pitch
    utterance.rate = 1; // Default rate

    // Speak the utterance
    window.speechSynthesis.speak(utterance);
  };
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      {/* Display button based on connection state */}
      {!isConnected ? (
        <button
          className="px-6 py-3 font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600"
          onClick={connectToAssistant}
        >
          Connect to Assistant
        </button>
      ) : (
        <div>
          <button
            className="px-6 py-3 font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
            onClick={() => sendMessage("can u explain it a little to me")}
          >
            click to send a premade question tochatgpt
          </button>
          <button onClick={playAudio}>press this button to play audio</button>
        </div>
      )}
    </div>
  );
}
