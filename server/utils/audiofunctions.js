function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const arrayBuffer = new ArrayBuffer(binaryString.length);
  const uint8Array = new Uint8Array(arrayBuffer);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }
  return arrayBuffer;
}

// Function to create the WAV file header
function createWavHeader(sampleRate, pcmDataLength) {
  const totalDataLength = pcmDataLength + 36; // Total file length with header (36 bytes for header + data)
  const buffer = new ArrayBuffer(44); // WAV header size is 44 bytes
  const view = new DataView(buffer);

  // "RIFF" header
  view.setUint8(0, 82);
  view.setUint8(1, 73);
  view.setUint8(2, 70);
  view.setUint8(3, 70); // "RIFF"
  view.setUint32(4, totalDataLength, true); // Total file length (including header)
  view.setUint8(8, 87);
  view.setUint8(9, 65);
  view.setUint8(10, 86);
  view.setUint8(11, 69); // "WAVE"

  // fmt chunk (16 bytes for PCM)
  view.setUint8(12, 102);
  view.setUint8(13, 109);
  view.setUint8(14, 116);
  view.setUint8(15, 32); // "fmt "
  view.setUint32(16, 16, true); // Size of fmt chunk (16 bytes)
  view.setUint16(20, 1, true); // Audio format (1 for PCM)
  view.setUint16(22, 1, true); // Number of channels (1 for mono)
  view.setUint32(24, sampleRate, true); // Sample rate (e.g., 24000)
  view.setUint32(28, sampleRate * 2, true); // Byte rate (sampleRate * numChannels * bitsPerSample / 8)
  view.setUint16(32, 2, true); // Block align (numChannels * bitsPerSample / 8)
  view.setUint16(34, 16, true); // Bits per sample (16 bits)

  // Data chunk header
  view.setUint8(36, 100);
  view.setUint8(37, 97);
  view.setUint8(38, 116);
  view.setUint8(39, 97); // "data"
  view.setUint32(40, pcmDataLength, true); // Size of the audio data

  return buffer;
}

// Function to concatenate the WAV header and PCM audio data
function concatenateWavHeaderAndData(header, pcmData) {
  const combinedLength = header.byteLength + pcmData.byteLength;
  const combinedBuffer = new ArrayBuffer(combinedLength);
  const combinedView = new Uint8Array(combinedBuffer);

  // Copy header and PCM data into the combined buffer
  combinedView.set(new Uint8Array(header), 0);
  combinedView.set(new Uint8Array(pcmData), header.byteLength);

  return combinedBuffer;
}

export { createWavHeader, concatenateWavHeaderAndData, base64ToArrayBuffer };
