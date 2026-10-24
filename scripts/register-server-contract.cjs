/* eslint-disable @typescript-eslint/no-require-imports */
// Match Next's react-server navigation alias, retaining real server-only exports.
const assert = require('node:assert/strict');
const Module = require('node:module');
assert.ok(process.execArgv.includes('--conditions=react-server'));
const original = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  if (request === 'next/navigation') request = 'next/dist/client/components/navigation.react-server';
  return original.call(this, request, ...args);
};
