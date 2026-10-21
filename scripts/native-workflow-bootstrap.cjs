/* eslint-disable @typescript-eslint/no-require-imports */
// Test-only adapters. Authentication, policies, transactions and notifications
// remain real; only framework request context and external I/O are substituted.
const Module = require('node:module');
const { AsyncLocalStorage } = require('node:async_hooks');
const { realpathSync, statSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = realpathSync(process.env.FLUX_NATIVE_TEST_ROOT || 'missing-test-root');
assert.ok(root.startsWith('/private/tmp/flux-native-'));
assert.equal(statSync(root).mode & 0o777, 0o700);
assert.ok(statSync(path.join(root, 's/.s.PGSQL.55432')).isSocket());
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'localhost');
assert.equal(url.searchParams.get('host'), path.join(root, 's'));
assert.match(url.pathname, /^\/native_[a-z0-9_]+$/);
const context = new AsyncLocalStorage();
global.__nativeFixtureContext = context;
let assertions = 0;
let externalRequests = 0;
const counted = new Proxy(assert, {
  apply(target, receiver, args) { assertions++; return Reflect.apply(target, receiver, args); },
  get(target, key) { const value = Reflect.get(target, key); return typeof value === 'function' && key !== 'AssertionError' ? (...args) => { assertions++; return value(...args); } : value; },
});
global.__nativeCountCheck = () => { assertions++; };
process.on('beforeExit', () => {
  if (!assertions || externalRequests) process.exitCode = 1;
  console.log(JSON.stringify({ suite: path.basename(process.argv[1]), assertions, outcome: process.exitCode ? 'FAIL' : 'PASS', genuineV2Sessions: true, externalRequests }));
});
const original = Module._load;
Module._load = function(name, ...args) {
  if (name === 'server-only') return {};
  if (name === 'sanitize-html') return original.call(this, path.join(__dirname, '../node_modules/.pnpm/sanitize-html@' + require('../node_modules/sanitize-html/package.json').version + '/node_modules/sanitize-html/index.js'), ...args);
  if (name === 'node:assert/strict') return counted;
  if (name === '@prisma/client') return original.call(this, path.join(root, 'client'), ...args);
  if (name === 'next/headers') return { cookies: async () => ({ get: () => context.getStore() ? { value: context.getStore() } : undefined }) };
  if (name === 'next/cache') return { unstable_cache: fn => fn, revalidatePath() {}, revalidateTag() {} };
  if (name === 'next/navigation') return { redirect(url) { throw new Error(`REDIRECT:${url}`); } };
  if (name === 'next/server') return { NextResponse: { json: (body, init) => Response.json(body, init) }, after() {} };
  if (name === 'react') return { cache: fn => fn };
  if (name === '@/lib/realtime/server') return new Proxy({}, { get: () => async () => false });
  if (name === '@/lib/storage/s3' || name === '@/lib/s3') return new Proxy({}, { get: (_target, key) => {
    if (key === 'getFileExtension') return original.call(this, path.join(process.env.COMPILED_ALIAS_ROOT, 'src/lib/upload-validation.js'), ...args).getFileExtension;
    if (['createPresignedDownloadUrl', 'createPresignedPreviewUrl'].includes(key)) return async () => 'https://fake-storage.invalid/signed';
    return () => { throw new Error(`FAKE_STORAGE_UNEXPECTED_OPERATION:${String(key)}`); };
  } });
  return original.call(this, name.startsWith('@/') ? path.join(process.env.COMPILED_ALIAS_ROOT, 'src', name.slice(2)) : name, ...args);
};
// No test can accidentally fall back to a real network storage/notification call.
global.fetch = async () => { externalRequests++; throw new Error('EXTERNAL_FETCH_FORBIDDEN'); };
for (const moduleName of ['node:http', 'node:https']) {
  const api = require(moduleName);
  api.request = api.get = () => { externalRequests++; throw new Error('EXTERNAL_HTTP_FORBIDDEN'); };
}
