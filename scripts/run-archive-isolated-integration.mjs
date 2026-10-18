// Compatibility entry point: the V2 runner uses a fresh private Unix socket,
// an environment whitelist, genuine isolated sessions and fake storage.
process.argv.push("--archives");
await import("./run-authorization-isolated-integration.mjs");
