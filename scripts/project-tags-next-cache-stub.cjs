/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const originalLoad = Module._load;
// Execute real list queries without requiring the Next.js request/cache runtime.
Module._load = function (request, parent, isMain) {
  if (request === "next/cache") return { unstable_cache: (query) => query };
  return originalLoad.call(this, request, parent, isMain);
};
