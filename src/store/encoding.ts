// Base64 ⇄ bytes for storing raw .fit files inline (SPEC §2 `fitFileB64`). Chunked encoding
// avoids call-stack blowups from spreading a large byte array into String.fromCharCode.
// Uses btoa/atob (DOM globals) — deliberately outside src/engine, which must stay DOM-free.

const CHUNK_SIZE = 0x8000

/** Firestore doc limit is 1 MB; keep the encoded .fit well under it (SPEC §2). */
export const FIT_FILE_B64_MAX_BYTES = 700_000

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE)))
  }
  return btoa(chunks.join(''))
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
