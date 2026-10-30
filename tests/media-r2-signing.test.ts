import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

/** The server-only adapter runs in a separate React server condition; no request is sent. */
test("AWS SDK presigns exact keys, sizes, MIME and non-overwrite headers without hoisting bearer metadata", () => {
  const script = `
    import { createR2Operations } from "./src/lib/media/r2.ts";
    const config = {accountId:"a".repeat(32),accessKeyId:"test-key",secretAccessKey:"test-secret",bucket:"test-bucket",publicBaseUrl:"https://cdn.example",prefix:"u/",maxFileSize:2147483648,multipartThreshold:67108864,partSize:16777216,signedUrlSeconds:600,sessionSeconds:86400};
    const r2 = createR2Operations(config);
    const ticket = await r2.signPut({key:"u/abcdefghijkl-photo.png",assetId:"test-asset",mimeType:"image/png",disposition:"inline",size:12});
    const put = new URL(ticket.url);
    const part = new URL((await r2.signPart("u/abcdefghijkl-video.mp4","test-upload",2,16777216)).url);
    const download = new URL(await r2.downloadUrl("u/abcdefghijkl-photo.png","photo.png"));
    process.stdout.write(JSON.stringify({
      putHost:put.hostname,putPath:put.pathname,putExpiry:put.searchParams.get("X-Amz-Expires"),putSignedHeaders:put.searchParams.get("X-Amz-SignedHeaders"),
      putHeaderNames:Object.keys(ticket.headers),condition:ticket.headers["If-None-Match"],queryHasMetadata:put.searchParams.has("x-amz-meta-asset-id"),
      partNumber:part.searchParams.get("partNumber"),partSignedHeaders:part.searchParams.get("X-Amz-SignedHeaders"),
      downloadDisposition:download.searchParams.get("response-content-disposition")
    }));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), encoding: "utf8" }));
  assert.match(result.putHost, /\.r2\.cloudflarestorage\.com$/);
  assert.match(result.putPath, /u\/abcdefghijkl-photo\.png$/);
  assert.equal(result.putExpiry, "600");
  assert.equal(result.condition, "*");
  assert.equal(result.queryHasMetadata, false);
  assert.equal(result.putSignedHeaders, "cache-control;content-disposition;content-length;content-type;host;if-none-match;x-amz-meta-asset-id");
  assert.equal(result.putHeaderNames.includes("Content-Length"), false, "browser computes this forbidden request header from the Blob");
  assert.equal(result.partNumber, "2");
  assert.equal(result.partSignedHeaders, "content-length;host");
  assert.ok(result.downloadDisposition.startsWith("attachment;"));
});
