import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

/** All credentials are inert fixtures; signing is local and never sends a request. */
function serverScript(script: string) {
  return JSON.parse(execFileSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], { cwd: process.cwd(), encoding: "utf8" }));
}

const fixtureConfiguration = `
  for (const name of Object.keys(process.env)) {
    if (name.startsWith("R2_") || name === "SUPABASE_SECRET_KEY") delete process.env[name];
  }
  Object.assign(process.env, {
    R2_ACCOUNT_ID:"a".repeat(32), R2_ACCESS_KEY_ID:"FORMAT_TEST_ONLY", R2_SECRET_ACCESS_KEY:"FORMAT_TEST_ONLY_SECRET",
    SUPABASE_SECRET_KEY:"FORMAT_TEST_ONLY_SUPABASE_SECRET", R2_BUCKET_NAME:"joemore-com-cdn",
    R2_PUBLIC_BASE_URL:"https://cdn.example.invalid", R2_PHOTOGRAPHY_ORIGINALS_BUCKET:"joemore-com-photography-originals"
  });
`;

test("private photography uploads sign private cache headers while existing media remains immutable", () => {
  const result = serverScript(`
    import { createR2Operations, IMMUTABLE_CACHE_CONTROL } from "./src/lib/media/r2.ts";
    const config = {accountId:"a".repeat(32),accessKeyId:"FORMAT_TEST_ONLY",secretAccessKey:"FORMAT_TEST_ONLY_SECRET",bucket:"fixture-bucket",publicBaseUrl:"https://cdn.example.invalid",prefix:"u/",maxFileSize:2147483648,multipartThreshold:67108864,partSize:16777216,signedUrlSeconds:600,sessionSeconds:86400};
    const input = {key:"originals/fixture/original.jpg",assetId:"fixture",mimeType:"image/jpeg",disposition:"attachment",size:123};
    const privateTicket = await createR2Operations(config,{cacheControl:"private, no-store"}).signPut(input);
    const existingTicket = await createR2Operations(config).signPut({...input,key:"u/abcdefghijkl.jpg"});
    const signed = new URL(privateTicket.url);
    process.stdout.write(JSON.stringify({privateCache:privateTicket.headers["Cache-Control"],existingCache:existingTicket.headers["Cache-Control"],immutable:IMMUTABLE_CACHE_CONTROL,signedHeaders:signed.searchParams.get("X-Amz-SignedHeaders"),expiry:signed.searchParams.get("X-Amz-Expires"),condition:privateTicket.headers["If-None-Match"]}));
  `);
  assert.equal(result.privateCache, "private, no-store");
  assert.equal(result.existingCache, "public, max-age=31536000, immutable");
  assert.equal(result.existingCache, result.immutable);
  assert.match(result.signedHeaders, /(?:^|;)cache-control(?:;|$)/);
  assert.match(result.signedHeaders, /(?:^|;)content-length(?:;|$)/);
  assert.equal(result.expiry, "600");
  assert.equal(result.condition, "*");
});

test("photography previews use private bucket, no-store responses and ten-minute signatures; downloads expire after five minutes", () => {
  const result = serverScript(`
    import { photographyStorage } from "./src/lib/photography/storage.ts";
    ${fixtureConfiguration}
    const storage = photographyStorage();
    const preview = new URL(await storage.privateR2.previewUrl("staging/fixture/preview.webp"));
    const original = new URL(await storage.privateR2.downloadUrl("originals/fixture/original.jpg","photo.jpg"));
    const upload = await storage.privateR2.signPut({key:"originals/fixture/original.jpg",assetId:"fixture",mimeType:"image/jpeg",disposition:"attachment",size:12});
    process.stdout.write(JSON.stringify({
      bucket:storage.privateBucket,previewHost:preview.hostname,previewPath:preview.pathname,previewExpiry:preview.searchParams.get("X-Amz-Expires"),
      previewCache:preview.searchParams.get("response-cache-control"),downloadHost:original.hostname,downloadPath:original.pathname,
      downloadExpiry:original.searchParams.get("X-Amz-Expires"),downloadDisposition:original.searchParams.get("response-content-disposition"),uploadCache:upload.headers["Cache-Control"]
    }));
  `);
  assert.equal(result.bucket, "joemore-com-photography-originals");
  assert.match(result.previewHost, /^joemore-com-photography-originals\.[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/);
  assert.equal(result.previewPath, "/staging/fixture/preview.webp");
  assert.equal(result.previewExpiry, "600");
  assert.equal(result.previewCache, "private, no-store");
  assert.equal(result.downloadHost, result.previewHost);
  assert.equal(result.downloadPath, "/originals/fixture/original.jpg");
  assert.equal(result.downloadExpiry, "300");
  assert.match(result.downloadDisposition, /^attachment;/);
  assert.match(result.downloadDisposition, /photo\.jpg/);
  assert.equal(result.uploadCache, "private, no-store");
});

test("photography storage fails safely for missing private configuration and shared public/private buckets", () => {
  const result = serverScript(`
    import { photographyStorage } from "./src/lib/photography/storage.ts";
    ${fixtureConfiguration}
    const failure = () => { try { photographyStorage(); return null; } catch (error) { return {status:error.status,code:error.code,message:error.message}; } };
    delete process.env.R2_PHOTOGRAPHY_ORIGINALS_BUCKET;
    const missing = failure();
    process.env.R2_PHOTOGRAPHY_ORIGINALS_BUCKET = "joemore-com-cdn";
    const publicBucket = failure();
    process.env.R2_PHOTOGRAPHY_ORIGINALS_BUCKET = "joemore-com-photography-originals";
    process.env.R2_BUCKET_NAME = "joemore-com-photography-originals";
    const sameBucket = failure();
    delete process.env.R2_ACCESS_KEY_ID;
    const missingCredentials = failure();
    process.stdout.write(JSON.stringify({missing,publicBucket,sameBucket,missingCredentials}));
  `);
  for (const name of ["missing", "publicBucket", "sameBucket"] as const) {
    assert.equal(result[name].status, 503);
    assert.equal(result[name].code, "photography_configuration");
    assert.match(result[name].message, /Configure the private/);
    assert.doesNotMatch(result[name].message, /FORMAT_TEST_ONLY/);
  }
  assert.equal(result.missingCredentials.status, 503);
  assert.match(result.missingCredentials.message, /R2_ACCESS_KEY_ID/);
  assert.doesNotMatch(result.missingCredentials.message, /FORMAT_TEST_ONLY/);
});
