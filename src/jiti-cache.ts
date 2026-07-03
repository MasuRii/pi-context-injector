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
export function ensureJitiFsCacheDirectory(): string | undefined {
	try {
		mkdirSync(JITI_CACHE_DIR, { recursive: true });
		return undefined;
	} catch (error) {
		// Best effort only: return the reason so callers can attach it if the
		// subsequent import also fails. The import surfaces the real failure.
		return error instanceof Error ? error.message : String(error);
	}
}
