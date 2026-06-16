import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const JITI_CACHE_DIR = join(tmpdir(), "jiti");

/**
 * Pi loads TypeScript extensions through jiti. When its temporary filesystem
 * cache directory has been removed between extension startup and a lazy import,
 * jiti can throw ENOENT while writing the transformed module. Recreate the
 * default temp cache directory before lazy imports so hooks stay functional in
 * empty or freshly-created workspaces.
 */
export function ensureJitiFsCacheDirectory(): void {
	try {
		mkdirSync(JITI_CACHE_DIR, { recursive: true });
	} catch {
		// Best effort only: the following import will surface the real failure.
	}
}
