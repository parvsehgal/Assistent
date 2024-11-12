import { useState, useRef } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [words, setWords] = useState("");
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  const audioChunksRef = useRef([]);

  const audioDataRef = useRef([]);

  // Function to connect to the WebSocket server
  const connectToAssistant = () => {
    // Create a new WebSocket connection
    const ws = new WebSocket("ws://localhost:4000/Assistant");

    // When the connection is opened
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
      setIsConnected(true);
    };

    ws.onmessage = async (event) => {
      const message = event.data;
      // Check if the message looks like JSON
      if (isJsonString(message)) {
        try {
          const jsonMessage = JSON.parse(message);
          console.log("Parsed JSON message:", jsonMessage);
          if (jsonMessage.type === "response.done") {
            for (let i = 0; i < audioDataRef.current.length; i++) {
              await playAudioFromArrayBuffer(audioDataRef.current[i]);
            }
            console.log(message);
            setWords(jsonMessage.response.output[0].content[0].transcript);
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      } else {
        console.warn("Received non-JSON message:", event);
        if (event.data instanceof Blob) {
          console.log("got a blobyy blob blob");
          const arrayBuffer = await event.data.arrayBuffer();
          console.log(arrayBuffer);
          audioDataRef.current.push(arrayBuffer);
        }
      }
    };

    const playAudioFromArrayBuffer = (audioBuffer) => {
      return new Promise((resolve, reject) => {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();

        // Decode the audio data
        audioContext.decodeAudioData(
          audioBuffer,
          (buffer) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);

            // Set playback rate (e.g., 0.5 for slower, 2 for faster)
            source.playbackRate.value = 1.0; // Adjust this as needed

            // On 'ended' event, resolve the promise to move to the next one
            source.onended = () => {
              resolve(); // Audio finished playing
            };

            // Start the audio playback
            source.start(0);
          },
          (error) => {
            reject("Error decoding audio data: " + error);
          },
        );
      });
    };

    // to check if a response is valid jsonString
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

  const closeConnection = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };

  const startRecording = async () => {
    setIsRecording(true);
    audioChunksRef.current = [];

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.start();

      mediaRecorder.onstart = () => {
        console.log("Recording started");
        setMessages((prev) => [
          ...prev,
          { role: "system", text: "Recording started..." },
        ]);
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log("Recording stopped");
        setMessages((prev) => [
          ...prev,
          { role: "system", text: "Processing audio..." },
        ]);
        processAudio();
      };
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setIsRecording(false);
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Microphone access denied or unavailable." },
      ]);
    }
  };

  const processAudio = async () => {
    const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });

    // Process the audio to PCM16 mono 24kHz using AudioContext
    const processedBase64Audio = await convertBlobToPCM16Mono24kHz(blob);

    if (!processedBase64Audio) {
      console.error("Audio processing failed.");
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Failed to process audio." },
      ]);
      return;
    }

    // Send the audio event to the backend via WebSocket
    if (socket && socket.readyState === WebSocket.OPEN) {
      audioDataRef.current = [];
      const conversationCreateEvent = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_audio",
              audio: processedBase64Audio,
            },
          ],
        },
      };
      socket.send(JSON.stringify(conversationCreateEvent));

      // Optionally, add the user's audio message to the UI
      setMessages((prev) => [
        ...prev,
        { role: "user", audio: processedBase64Audio },
      ]);

      // Trigger a response.create event to prompt assistant's response
      const responseCreateEvent = {
        type: "response.create",
        response: {
          modalities: ["text", "audio"], // Include audio modality
        },
      };
      socket.send(JSON.stringify(responseCreateEvent));

      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Audio sent to assistant for processing." },
      ]);
    } else {
      console.error("WebSocket is not open.");
      setMessages((prev) => [
        ...prev,
        { role: "system", text: "Unable to send audio. Connection is closed." },
      ]);
    }
  };

  const convertBlobToPCM16Mono24kHz = async (blob) => {
    try {
      // Initialize AudioContext with target sample rate
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000, // Target sample rate
      });

      // Decode the audio data
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Downmix to mono if necessary
      let channelData =
        audioBuffer.numberOfChannels > 1
          ? averageChannels(
            audioBuffer.getChannelData(0),
            audioBuffer.getChannelData(1),
          )
          : audioBuffer.getChannelData(0);

      // Convert Float32Array to PCM16
      const pcm16Buffer = float32ToPCM16(channelData);

      // Base64 encode the PCM16 buffer
      const base64Audio = arrayBufferToBase64(pcm16Buffer);

      // Close the AudioContext to free resources
      audioCtx.close();

      return base64Audio;
    } catch (error) {
      console.error("Error processing audio:", error);
      return null;
    }
  };

  /**
   * Averages two Float32Arrays to produce a mono channel.
   * @param {Float32Array} channel1 - First channel data.
   * @param {Float32Array} channel2 - Second channel data.
   * @returns {Float32Array} - Averaged mono channel data.
   */
  const averageChannels = (channel1, channel2) => {
    const length = Math.min(channel1.length, channel2.length);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = (channel1[i] + channel2[i]) / 2;
    }
    return result;
  };

  /**
   * Converts a Float32Array of audio samples to a PCM16 ArrayBuffer.
   * @param {Float32Array} float32Array - The audio samples.
   * @returns {ArrayBuffer} - The PCM16 encoded audio.
   */
  const float32ToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, s, true); // little-endian
    }
    return buffer;
  };

  /**
   * Converts an ArrayBuffer or Uint8Array to a base64-encoded string.
   * @param {ArrayBuffer | Uint8Array} buffer - The buffer to encode.
   * @returns {string} - The base64-encoded string.
   */
  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };
  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
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
            className="px-6 py-3 font-semibold text-white bg-purple-500 rounded-lg hover:bg-purple-600"
            onClick={isRecording ? stopRecording : startRecording} // Corrected the toggle function
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>
          <button
            className="px-6 py-3 font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
            onClick={closeConnection}
          >
            Close Connection to Assistant
          </button>
        </div>
      )}
    </div>
  );
}
