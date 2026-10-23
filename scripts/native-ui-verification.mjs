import nodeAssert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Keep native UI contracts; execute authority/navigation through actual V2
// services in the established disposable-PG harness. No cached receipt or skip.
export function nativeUiVerification(suite) {
  let assertions = 0;
  const assert = new Proxy(nodeAssert, {
    apply(target, receiver, args) {
      assertions += 1;
      return Reflect.apply(target, receiver, args);
    },
    get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== "function" || property === "AssertionError") return value;
      return (...args) => { assertions += 1; return Reflect.apply(value, target, args); };
    },
  });
  function finish(flags, requiredCheckpoints) {
    nodeAssert.ok(assertions > 0, `${suite}: no native UI assertions executed`);
    const result = spawnSync(process.execPath, ["scripts/run-authorization-isolated-integration.mjs", ...flags], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env: { PATH: process.env.PATH, LANG: "C", CHECKPOINT_DISABLE: "1" },
      encoding: "utf8", timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
    });
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    nodeAssert.equal(result.status, 0, `${suite}: isolated V2 checks failed (${result.error?.message ?? result.signal ?? result.status})`);
    for (const checkpoint of requiredCheckpoints) nodeAssert.ok(result.stdout.includes(checkpoint), `Missing V2 behavior check: ${checkpoint}`);
    const checkpoints = result.stdout.split("\n").filter(line => line.startsWith("PASS")).length;
    nodeAssert.ok(checkpoints > 0, `${suite}: no isolated assertions completed`);
    console.log(JSON.stringify({ suite, outcome: "PASS", sourceAssertions: assertions, isolatedCheckpoints: checkpoints }));
  }
  return { assert, finish };
}
