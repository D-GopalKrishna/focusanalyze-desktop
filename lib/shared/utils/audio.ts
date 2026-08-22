/**
 * Convert raw PCM audio to WAV format with proper headers.
 *
 * FocusAI voice (cascade Cartesia / historical Gemini Live) sends raw 24kHz,
 * 16-bit, mono PCM. Browsers need WAV (with headers) to play it.
 *
 * @param pcmData Raw PCM audio bytes
 * @param sampleRate Sample rate in Hz (default: 24000)
 * @param numChannels Number of audio channels (default: 1 for mono)
 * @param bitsPerSample Bits per sample (default: 16)
 * @returns WAV format audio with headers
 */
export function pcmToWav(
  pcmData: ArrayBuffer,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16,
): ArrayBuffer {
  const pcmView = new DataView(pcmData);
  const pcmLength = pcmData.byteLength;

  // WAV file header size
  const headerSize = 44;
  const wavBuffer = new ArrayBuffer(headerSize + pcmLength);
  const wavView = new DataView(wavBuffer);

  // Write WAV header
  let offset = 0;

  // "RIFF" chunk descriptor
  wavView.setUint32(offset, 0x52494646, false);
  offset += 4; // "RIFF"
  wavView.setUint32(offset, 36 + pcmLength, true);
  offset += 4; // File size - 8
  wavView.setUint32(offset, 0x57415645, false);
  offset += 4; // "WAVE"

  // "fmt " sub-chunk
  wavView.setUint32(offset, 0x666d7420, false);
  offset += 4; // "fmt "
  wavView.setUint32(offset, 16, true);
  offset += 4; // Subchunk size (16 for PCM)
  wavView.setUint16(offset, 1, true);
  offset += 2; // Audio format (1 = PCM)
  wavView.setUint16(offset, numChannels, true);
  offset += 2; // Number of channels
  wavView.setUint32(offset, sampleRate, true);
  offset += 4; // Sample rate
  wavView.setUint32(offset, sampleRate * numChannels * (bitsPerSample / 8), true);
  offset += 4; // Byte rate
  wavView.setUint16(offset, numChannels * (bitsPerSample / 8), true);
  offset += 2; // Block align
  wavView.setUint16(offset, bitsPerSample, true);
  offset += 2; // Bits per sample

  // "data" sub-chunk
  wavView.setUint32(offset, 0x64617461, false);
  offset += 4; // "data"
  wavView.setUint32(offset, pcmLength, true);
  offset += 4; // Data size

  // Copy PCM data
  for (let i = 0; i < pcmLength; i += 2) {
    wavView.setInt16(offset + i, pcmView.getInt16(i, true), true);
  }

  return wavBuffer;
}
