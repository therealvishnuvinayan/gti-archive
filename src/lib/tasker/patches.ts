export type FieldPatch = { id: number; path: string[]; value: unknown };

export function applyFieldPatches<T extends Record<string, unknown>>(value: T, patches: FieldPatch[]): T {
  const result = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const patch of patches) {
    if (!patch.path.length || patch.path.some((key) => ["__proto__", "constructor", "prototype"].includes(key))) continue;
    let node = result;
    for (const key of patch.path.slice(0, -1)) {
      if (!node[key] || typeof node[key] !== "object" || Array.isArray(node[key])) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    node[patch.path.at(-1)!] = patch.value;
  }
  return result as T;
}
