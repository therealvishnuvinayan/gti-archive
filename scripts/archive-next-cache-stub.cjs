/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("node:module");
const originalLoad = Module._load;
// Exercise real server actions and database queries without Next's request runtime.
Module._load = function (request, parent, isMain) {
  if (request === "next/cache") return {
    unstable_cache: (query) => query,
    revalidatePath: () => {},
    revalidateTag: () => {},
  };
  return originalLoad.call(this, request, parent, isMain);
};
