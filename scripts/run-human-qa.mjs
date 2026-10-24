// Interactive adaptation of run-dashboard-isolated and archive-folders-browser-check.
// No environment-file loading, supplied database URL, live storage or deployment.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createSocketServer } from 'node:net';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { prepareHumanQA, smokeHumanQA } from './human-qa-fixture.mjs';

const repository = resolve(import.meta.dirname, '..'), require = createRequire(import.meta.url);
const args = process.argv.slice(2);
assert.ok(args.every(a => a === '--smoke' || a.startsWith('--build=')), 'Only --smoke and --build=PATH are supported');
const smoke = args.includes('--smoke'), origin = 'http://127.0.0.1:3117', storageOrigin = 'http://127.0.0.1:3118';
const artifacts = join(repository, '.tmp/phase81', smoke ? 'smoke' : 'interactive');
mkdirSync(artifacts, { recursive: true, mode: 0o700 });
const root = mkdtempSync('/private/tmp/flux-v2-human-qa-'), data = join(root, 'data'), socket = join(root, 's'), app = join(root, 'app');
const url = `postgresql://human_qa@localhost:55441/human_qa?host=${encodeURIComponent(socket)}&connect_timeout=5`;
const flags = Object.fromEntries(['SHARED_FILE_IDENTITY','APPROVAL_ENGINE','SHARED_EVENTS','UNIVERSAL_TASKER','TASKER_DELIVERABLES','TASKER_CONCEPTS','TASKER_SISTERS','STAGE_BUILDER_DRAFTS','STAGE_BUILDER_PUBLICATION','STAGE_RUNTIME','RUNTIME_INTEGRATION','ARCHIVE_FOLDERS','ARCHIVE_VERIFICATION','ARCHIVE_SHARING','ARCHIVE_RUNTIME','DASHBOARD_V2','SEARCH_V2','CALENDAR_V2','NOTIFICATIONS_V2'].map(k => ['FLUX_' + k, '1']));
const env = { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', NEXT_TELEMETRY_DISABLED: '1', CHECKPOINT_DISABLE: '1', PRISMA_HIDE_UPDATE_MESSAGE: '1', PGPASSFILE: join(root, 'no-password'), PGSERVICEFILE: join(root, 'no-service'), DATABASE_URL: url, DIRECT_URL: url, ...flags };
const run = (cmd, argv, options = {}) => {
  const result = spawnSync(cmd, argv, { cwd: root, env, encoding: 'utf8', timeout: 180000, maxBuffer: 16e6, ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
  return result.stdout.trim();
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function files(path) { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)]); }
const result = { mode: smoke ? 'automated smoke' : 'human fixture', startedAt: new Date().toISOString(), checks: [], pageErrors: [], externalRequests: [], unexpectedResponses: [], storageOperations: [], humanResults: 'NOT RUN' };
let started = false, server, storage, db, browser, portReservation;
const logs = [];
let stop;
const stopped = new Promise(resolve => { stop = resolve; });
process.once('SIGINT', stop); process.once('SIGTERM', stop);
try {
  // Refuse an occupied QA port instead of accidentally using somebody else's app.
  portReservation = createSocketServer();
  await new Promise((resolve, reject) => { portReservation.once('error', reject); portReservation.listen(3117, '127.0.0.1', resolve); });
  let build = args.find(a => a.startsWith('--build='))?.slice(8);
  if (!build) {
    console.log('Building the existing isolated all-flags application (no live environment).');
    run(process.execPath, [join(repository, 'scripts/dashboard-v2-build.mjs'), '--compatibility', '--evidence-dir=.tmp/phase81/build'], { timeout: 360000 });
    build = readFileSync(join(repository, '.tmp/phase81/build/build-path'), 'utf8').trim();
  }
  build = resolve(build);
  assert.ok(build.startsWith('/private/tmp/flux-dashboard-build-') && existsSync(join(build, '.next/BUILD_ID')), 'Use an isolated dashboard build');
  for (const path of [...files(join(repository, 'src')), ...files(join(repository, 'prisma')), ...files(join(repository, 'public')), ...['package.json','pnpm-lock.yaml','next.config.ts','tsconfig.json','postcss.config.mjs'].map(p => join(repository, p))]) {
    assert.equal(hash(readFileSync(path)), hash(readFileSync(join(build, path.slice(repository.length + 1)))), 'Isolated build source differs: ' + path);
  }
  result.buildSourceMatches = true;
  mkdirSync(socket, { mode: 0o700 }); mkdirSync(app);
  run('initdb', ['-D', data, '-U', 'human_qa', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  run('pg_ctl', ['-D', data, '-l', join(root, 'pg.log'), '-o', `-h '' -k ${socket} -p 55441 -c unix_socket_permissions=0700 -c shared_buffers=16MB -c timezone=UTC`, '-w', 'start']);
  started = true;
  run('createdb', ['-h', socket, '-p', '55441', '-U', 'human_qa', 'human_qa']);
  cpSync(join(repository, 'prisma'), join(root, 'prisma'), { recursive: true });
  run(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', join(root, 'prisma/schema.prisma')]);
  const { PrismaClient } = require('@prisma/client'); db = new PrismaClient({ datasourceUrl: url });
  const [identity] = await db.$queryRaw`SELECT current_setting('data_directory') AS data, current_setting('listen_addresses') AS tcp, current_setting('server_version') AS version, current_setting('TimeZone') AS timezone`;
  assert.equal(identity.data, data); assert.equal(identity.tcp, ''); assert.equal(identity.timezone, 'UTC'); result.postgres = identity.version; result.databaseTimezone = identity.timezone;
  const [ledger] = await db.$queryRaw`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(ledger.count, readdirSync(join(repository, 'prisma/migrations')).filter(n => /^\d+_/.test(n)).length);
  result.migrations = ledger.count;

  // The established local S3 protocol fixture: conditional copy and exact ETag reads.
  const objects = new Map();
  storage = createServer(async (req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'PUT,GET,HEAD,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', '*'); res.setHeader('Access-Control-Expose-Headers', 'ETag');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const target = new URL(req.url, storageOrigin), key = decodeURIComponent(target.pathname);
      result.storageOperations.push(req.method + ' ' + key);
      if (req.method === 'PUT') {
        const copy = req.headers['x-amz-copy-source'];
        if (copy) {
          const original = objects.get('/' + decodeURIComponent(copy).replace(/^\//, ''));
          if (!original || req.headers['x-amz-copy-source-if-match'] !== original.etag) { res.writeHead(412); res.end(); return; }
          objects.set(key, { ...original, body: Buffer.from(original.body) });
          res.setHeader('Content-Type', 'application/xml'); res.end(`<CopyObjectResult><LastModified>${new Date().toISOString()}</LastModified><ETag>${original.etag}</ETag></CopyObjectResult>`); return;
        }
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 100 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks), etag = '"' + createHash('md5').update(body).digest('hex') + '"';
        objects.set(key, { body, type: req.headers['content-type'] || 'application/octet-stream', etag }); res.setHeader('ETag', etag); res.end(); return;
      }
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); res.end(); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const object = objects.get(key);
      if (!object) { res.writeHead(404); res.end(); return; }
      if ((req.headers['if-match'] && req.headers['if-match'] !== object.etag) || (target.searchParams.has('versionId') && target.searchParams.get('versionId') !== object.version)) { res.writeHead(412); res.end(); return; }
      if (object.version) res.setHeader('x-amz-version-id', object.version);
      res.setHeader('Content-Length', object.body.length); res.setHeader('Content-Type', object.type); res.setHeader('ETag', object.etag); res.end(req.method === 'HEAD' ? undefined : object.body);
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise((resolve, reject) => { storage.once('error', reject); storage.listen(3118, '127.0.0.1', resolve); });
  for (const p of ['package.json','public','next.config.ts']) cpSync(join(build, p), join(app, p), { recursive: true });
  cpSync(join(build, '.next'), join(app, '.next'), { recursive: true, filter: p => !p.startsWith(join(build, '.next/cache')) && !p.startsWith(join(build, '.next/dev')) });
  symlinkSync(join(repository, 'node_modules'), join(app, 'node_modules'), 'dir');
  await new Promise(r => portReservation.close(r));
  server = spawn(process.execPath, ['--require', join(repository, 'scripts/human-qa-network-guard.cjs'), require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3117'], { cwd: app, env: { ...env, NODE_ENV: 'production', APP_URL: origin, NEXT_PUBLIC_REALTIME_PROVIDER: 'none', AWS_EC2_METADATA_DISABLED: 'true', AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'fixture-only', AWS_SECRET_ACCESS_KEY: 'fixture-only', AWS_S3_BUCKET: 'fixture-bucket', AWS_ENDPOINT_URL_S3: storageOrigin, S3_USE_ACCELERATE_ENDPOINT: 'false' }, stdio: ['ignore','pipe','pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => logs.push(chunk.toString()));
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'QA application exited; check the private server log');
    try { if ((await fetch(origin + '/sign-in')).status === 200) break; } catch { /* wait for startup */ }
    assert.ok(i < 99, 'QA application did not start'); await new Promise(r => setTimeout(r, 200));
  }
  // Same installed Playwright/browser used by the existing acceptance harness.
  const harness = process.env.FLUX_PLAYWRIGHT_PACKAGE || '/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json';
  const { chromium } = createRequire(harness)('playwright-core');
  browser = await chromium.launch({ headless: true, args: ['--disable-background-networking'] }); result.chromium = browser.version();
  const fixture = await prepareHumanQA({ db, browser, root, origin, storageOrigin, objects, result });
  if (smoke) await smokeHumanQA({ ...fixture, db, origin, root, artifacts, result });
  result.status = 'PASS';
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  if (!smoke) {
    await browser.close(); browser = null;
    const receipt = { origin, root, pid: process.pid, accountCard: join(root, 'accounts.txt'), sampleFile: join(root, 'QA-proof.pdf'), fixtureLinks: join(root, 'fixture-links.html'), humanResults: 'NOT RUN' };
    writeFileSync(join(artifacts, 'current.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
    console.log(`QA ready: ${origin}\nPrivate account card: ${receipt.accountCard}\nFixture links: ${receipt.fixtureLinks}\nSample PDF: ${receipt.sampleFile}\nLeave this terminal running. Ctrl+C removes this disposable session. Restart to reset; credentials change.`);
    server.once('exit', stop);
    await stopped;
  } else console.log('PASS: isolated fixture and targeted browser smoke. Human tests remain NOT RUN.');
} catch (error) {
  result.status = 'FAIL'; result.error = error.message; console.error(error); process.exitCode = 1;
  if (browser) for (const [index, context] of browser.contexts().entries()) {
    const page = context.pages()[0];
    if (page) {
      await page.screenshot({ path: join(artifacts, `failure-${index}.png`), fullPage: true }).catch(() => {});
      writeFileSync(join(artifacts, `failure-${index}.txt`), await page.locator('body').innerText().catch(() => ''), { mode: 0o600 });
    }
  }
} finally {
  if (browser) await browser.close();
  if (portReservation?.listening) await new Promise(r => portReservation.close(r));
  if (server && server.exitCode === null) { const exited = new Promise(r => server.once('exit', r)); server.kill('SIGTERM'); await exited; }
  if (storage?.listening) { storage.closeAllConnections(); await new Promise(r => storage.close(r)); }
  if (db) await db.$disconnect();
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  writeFileSync(join(artifacts, 'server.log'), logs.join(''), { mode: 0o600 });
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ ...result, stoppedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  if (!smoke) rmSync(join(artifacts, 'current.json'), { force: true });
  rmSync(root, { recursive: true, force: true });
  console.log('Disposable QA data, storage, sessions and credentials removed.');
}
