/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const Module = require("node:module");

const compiledRoot = process.env.COMPILED_ALIAS_ROOT;
if (!compiledRoot) {
  throw new Error("COMPILED_ALIAS_ROOT is required.");
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveCompiledAlias(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) {
    request = path.resolve(compiledRoot, "src", request.slice(2));
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
