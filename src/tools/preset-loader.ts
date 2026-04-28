import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Loads preset JSON files from BOTH the built-in directory and an optional
 * user directory. Built-in presets are shipped with the npm package; user
 * presets live wherever PLUTIO_USER_PRESETS_DIR points (typically the user's
 * extracted Plutio templates that should never be published).
 *
 * Conflict resolution: a user preset with the same slug as a built-in
 * shadows the built-in. This lets users override shipped presets locally
 * without forking the package.
 */

const BUILTIN_PRESETS_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
);

export interface LoadedPreset {
  filePath: string;
  source: "builtin" | "user";
  data: unknown;
}

export function loadPresetsFor<T extends { slug: string }>(
  category: "contracts" | "proposals",
): T[] {
  const builtinDir = path.join(BUILTIN_PRESETS_ROOT, category);
  const userDir = process.env.PLUTIO_USER_PRESETS_DIR
    ? path.join(process.env.PLUTIO_USER_PRESETS_DIR, category)
    : undefined;

  const bySlug = new Map<string, T>();

  // Load built-in first
  if (existsSync(builtinDir)) {
    for (const file of readdirSync(builtinDir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(path.join(builtinDir, file), "utf8")) as T;
        if (data?.slug) bySlug.set(data.slug, data);
      } catch {
        // skip malformed file
      }
    }
  }

  // Then user dir — shadows built-ins on slug collision
  if (userDir && existsSync(userDir)) {
    for (const file of readdirSync(userDir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(path.join(userDir, file), "utf8")) as T;
        if (data?.slug) bySlug.set(data.slug, data);
      } catch {
        // skip malformed file
      }
    }
  }

  return [...bySlug.values()];
}

export function listPresetSources(category: "contracts" | "proposals"): {
  builtinDir: string;
  userDir?: string;
  userPresetsLoaded: number;
  builtinPresetsLoaded: number;
} {
  const builtinDir = path.join(BUILTIN_PRESETS_ROOT, category);
  const userDir = process.env.PLUTIO_USER_PRESETS_DIR
    ? path.join(process.env.PLUTIO_USER_PRESETS_DIR, category)
    : undefined;
  const count = (dir?: string) =>
    dir && existsSync(dir)
      ? readdirSync(dir).filter((f) => f.endsWith(".json")).length
      : 0;
  return {
    builtinDir,
    userDir,
    builtinPresetsLoaded: count(builtinDir),
    userPresetsLoaded: count(userDir),
  };
}
