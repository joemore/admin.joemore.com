import { MediaError } from "../media/types";

/** Rebuild RIFF without EXIF/XMP chunks before any public image is written. */
export function stripWebpMetadata(input: Uint8Array): Uint8Array {
  const ascii = (from: number, to: number) => new TextDecoder().decode(input.slice(from, to));
  if (input.length < 20 || ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") throw new MediaError("Invalid WebP derivative.");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(4, true) + 8 !== input.length) throw new MediaError("Incomplete WebP derivative.");
  const chunks: Uint8Array[] = []; let total = 12; let image = false;
  for (let offset = 12; offset < input.length;) {
    if (offset + 8 > input.length) throw new MediaError("Invalid WebP chunk.");
    const kind = ascii(offset, offset + 4); const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > input.length) throw new MediaError("Invalid WebP chunk length.");
    if (kind === "VP8 " || kind === "VP8L") image = true;
    if (kind === "ANIM" || kind === "ANMF") throw new MediaError("Use a still WebP derivative.");
    if (["VP8 ", "VP8L", "VP8X", "ALPH", "ICCP"].includes(kind)) {
      const chunk = input.slice(offset, end);
      if (kind === "VP8X" && size >= 10) chunk[8] &= ~0x0c;
      chunks.push(chunk); total += chunk.length;
    }
    offset = end;
  }
  if (!image) throw new MediaError("WebP image data is missing.");
  const output = new Uint8Array(total); output.set(input.slice(0, 12)); new DataView(output.buffer).setUint32(4, total - 8, true);
  let offset = 12; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
