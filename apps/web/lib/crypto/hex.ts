// Minimal hex helpers (replaces a `0x`-prefixed hex-string type + hexToBytes import).

export type Hex = `0x${string}`

export function hexToBytes(hex: Hex | string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) {
    throw new Error('hex string has an odd length')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = '0x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s as Hex
}
