import assert from "node:assert/strict";
import test from "node:test";
import { formatBytes, mediaRequest, MediaRequestError, prepareThumbnail } from "../src/components/media/client";

test("client media requests keep cookies same-origin and surface controlled server errors", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, options) => {
      assert.equal(options?.credentials, "same-origin");
      assert.equal(options?.cache, "no-store");
      assert.equal(new Headers(options?.headers).get("Content-Type"), "application/json");
      assert.ok(options?.signal);
      return Response.json({ error: "Administrator access is required." }, { status: 403 });
    };
    await assert.rejects(mediaRequest("/api/media"), (error: unknown) => error instanceof MediaRequestError && error.status === 403 && error.message === "Administrator access is required.");
  } finally { globalThis.fetch = original; }
});

test("non-JSON upstream errors use a useful message without leaking their response", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("sensitive gateway output", { status: 502 });
    await assert.rejects(mediaRequest("/api/media"), (error: unknown) => error instanceof MediaRequestError && error.status === 502 && !error.message.includes("sensitive"));
  } finally { globalThis.fetch = original; }
});

test("thumbnail preparation rejects oversized or unsupported files before reading bytes", async () => {
  const file = { type: "image/png", size: 21 * 1024 * 1024, slice: () => { throw new Error("Must not read oversized original"); } } as unknown as File;
  assert.deepEqual(await prepareThumbnail(file), {});
  assert.deepEqual(await prepareThumbnail({ ...file, type: "video/mp4", size: 100 } as File), {});
});

test("thumbnail preparation checks dimensions before invoking the image decoder", async () => {
  const original = globalThis.createImageBitmap;
  let decodes = 0;
  try {
    globalThis.createImageBitmap = (() => { decodes++; throw new Error("Must not decode enormous images"); }) as typeof createImageBitmap;
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 15000); view.setUint32(20, 15000);
    assert.deepEqual(await prepareThumbnail(new File([bytes], "huge.png", { type: "image/png" })), {});
    assert.equal(decodes, 0);
    assert.deepEqual(await prepareThumbnail(new File([new Uint8Array(50)], "unknown.avif", { type: "image/avif" })), {});
    assert.equal(decodes, 0);
  } finally { globalThis.createImageBitmap = original; }
});

test("an unsupported decoder leaves the original available without a thumbnail", async () => {
  const original = globalThis.createImageBitmap;
  let calls = 0;
  try {
    globalThis.createImageBitmap = (async (_source: ImageBitmapSource, options?: ImageBitmapOptions) => {
      calls++;
      assert.equal(options?.resizeWidth, 400);
      throw new DOMException("This browser cannot decode the image", "InvalidStateError");
    }) as typeof createImageBitmap;
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 800); view.setUint32(20, 400);
    const file = new File([bytes], "original.png", { type: "image/png" });
    assert.deepEqual(await prepareThumbnail(file), {});
    assert.equal(calls, 1);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  } finally { globalThis.createImageBitmap = original; }
});

test("byte formatting remains bounded for small files and multi-gigabyte videos", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(2 * 1024 ** 3), "2.0 GB");
});
