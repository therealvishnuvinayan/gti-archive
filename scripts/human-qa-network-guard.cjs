// Same loopback-only HTTP boundary as the existing isolated browser harness.
// Loaded only in the disposable Next.js process, never the developer server.
/* eslint-disable @typescript-eslint/no-require-imports */
const local = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
for (const protocol of ['http', 'https']) {
  const transport = require('node:' + protocol);
  for (const method of ['request', 'get']) {
    const original = transport[method];
    transport[method] = function (...args) {
      const arg = args[0];
      const host = typeof arg === 'string' || arg instanceof URL
        ? new URL(arg).hostname : arg?.hostname || arg?.host || 'localhost';
      if (!local.has(host)) throw new Error('QA_EXTERNAL_NETWORK_FORBIDDEN');
      return original.apply(this, args);
    };
  }
}
const originalFetch = global.fetch;
global.fetch = (input, ...args) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local.has(url.hostname)) throw new Error('QA_EXTERNAL_NETWORK_FORBIDDEN');
  return originalFetch(input, ...args);
};
