import { useState, useRef } from "react";
import { LiveAudioVisualizer } from "react-audio-visualize";

export default function Home() {
  const [MEDIAREC, setMEDIAREC] = useState([]);
  const canvasRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [words, setWords] = useState("");
  const [messages, setMessages] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);

  const audioChunksRef = useRef([]);
  const audioDataRef = useRef([]);

  const [isResponsePlaying, setResPlaying] = useState(false);

  const connectToAssistant = () => {
    const ws = new WebSocket("ws://localhost:4000/Assistant");
    ws.onopen = () => {
      console.log("Connected to WebSocket server");
      setIsConnected(true);
    };

    ws.onmessage = async (event) => {
      const message = event.data;
      if (isJsonString(message)) {
        try {
          const jsonMessage = JSON.parse(message);
          if (jsonMessage.type === "response.done") {
            setResPlaying(false);
            for (let i = 0; i < audioDataRef.current.length; i++) {
              await playAudioFromArrayBuffer(audioDataRef.current[i]);
            }
            setWords(jsonMessage.response.output[0].content[0].transcript);
          }
        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      } else {
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          audioDataRef.current.push(arrayBuffer);
        }
      }
    };

    const playAudioFromArrayBuffer = (audioBuffer) => {
      return new Promise((resolve, reject) => {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        audioContext.decodeAudioData(
          audioBuffer,
          (buffer) => {
            const source = audioContext.createBufferSource();
            source.buffer = buffer;

            // Create an analyser node
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            // Connect the source to the analyser and the analyser to the destination (speakers)
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            // Visualization function
            const draw = () => {
              analyser.getByteFrequencyData(dataArray);
              const canvas = canvasRef.current;
              if (canvas) {
                const canvasContext = canvas.getContext("2d");
                if (canvasContext) {
                  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

                  const barWidth = (canvas.width / bufferLength) * 2.5;
                  let x = 0;
                  for (let i = 0; i < bufferLength; i++) {
                    const barHeight = dataArray[i];
                    canvasContext.fillStyle = "rgb(150, 150, 255)"; // Darker lavender color
                    canvasContext.fillRect(
                      x,
                      canvas.height - barHeight,
                      barWidth,
                      barHeight,
                    );
                    x += barWidth + 1;
                  }

                  // Continue drawing
                  if (canvasRef.current && canvasRef.current.getContext) {
                    requestAnimationFrame(draw);
                  }
                }
              }
            };

            draw();

            source.onended = () => {
              resolve();
            };

            source.start(0);
          },
          (error) => {
            reject("Error decoding audio data: " + error);
          },
        );
      });
    };

    const isJsonString = (str) => {
      try {
        JSON.parse(str);
        return true;
      } catch (error) {
        return false;
      }
    };

    ws.onclose = () => {
      console.log("WebSocket connection closed");
      setIsConnected(false);
    };

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      setMEDIAREC(mediaRecorder);
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

  const stopRecording = () => {
    setIsRecording(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    setResPlaying(true);
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

      setMessages((prev) => [
        ...prev,
        { role: "user", audio: processedBase64Audio },
      ]);

      const responseCreateEvent = {
        type: "response.create",
        response: {
          modalities: ["text", "audio"],
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
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
      });

      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      let channelData =
        audioBuffer.numberOfChannels > 1
          ? averageChannels(
            audioBuffer.getChannelData(0),
            audioBuffer.getChannelData(1),
          )
          : audioBuffer.getChannelData(0);

      const pcm16Buffer = float32ToPCM16(channelData);
      const base64Audio = arrayBufferToBase64(pcm16Buffer);

      audioCtx.close();

      return base64Audio;
    } catch (error) {
      console.error("Error processing audio:", error);
      return null;
    }
  };

  const averageChannels = (channel1, channel2) => {
    const length = Math.min(channel1.length, channel2.length);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      result[i] = (channel1[i] + channel2[i]) / 2;
    }
    return result;
  };

  const float32ToPCM16 = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(i * 2, s, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const length = bytes.byteLength;
    for (let i = 0; i < length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-gray-100 to-gray-300 relative">
      {!isConnected ? (
        <div className="flex flex-col items-center space-y-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Welcome to the Assistant
          </h1>
          <button
            className="px-8 py-4 text-lg font-semibold text-white bg-blue-600 rounded-full shadow-lg hover:bg-blue-700 transition-all"
            onClick={connectToAssistant}
          >
            Connect to Assistant
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-8">
          <button
            className={`px-8 py-4 text-lg font-semibold text-white rounded-full shadow-lg transition-all ${isRecording
                ? "bg-red-500 hover:bg-red-600"
                : "bg-green-500 hover:bg-green-600"
              }`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>

          {/* Close Connection Button */}
          <button
            className="absolute left-6 bottom-6 px-6 py-3 text-sm font-medium text-white bg-red-500 rounded-lg shadow-md hover:bg-red-600 transition-all"
            onClick={closeConnection}
          >
            Close Connection
          </button>

          {/* Visualizations */}
          <div className="flex flex-col items-center space-y-4">
            {MEDIAREC && (
              <div className="p-4 bg-white rounded-lg shadow-md">
                <LiveAudioVisualizer
                  mediaRecorder={MEDIAREC}
                  width={300}
                  height={100}
                />
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={500}
              height={100}
              className="border border-gray-300 rounded-md shadow-sm"
            ></canvas>
          </div>

          {/* Loader */}
          {isResponsePlaying ? (
            <div className="absolute top-6 right-6 flex items-center space-x-2">
              <div className="w-4 h-4 rounded-full bg-blue-600 animate-ping"></div>
              <span className="text-sm font-medium text-gray-700">
                Assistant is Thinking...
              </span>
            </div>
          ) : (
            <div></div>
          )}
        </div>
      )}
    </div>
  );
}
