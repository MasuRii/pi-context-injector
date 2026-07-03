import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// RED test (TDD): proves pi-context-injector must NOT import from the shared
// zellij-modal extension. The shared extension lives at
// agent/extensions/zellij-modal; config-modal.ts lives at
// agent/extensions/pi-context-injector/src, so every shared import takes the
// form ../../zellij-modal/... — a relative path that escapes this extension's
// own directory. Once the modal code is vendored locally this test passes
// (GREEN).

const SHARED_ZELLIJ_MODAL_PATH = /(?:\.\.\/)+zellij-modal\b/;

const EXCLUDED_DIRS = new Set([
	"node_modules",
	".test-dist",
	"dist",
	"debug",
	"test",
	".git",
]);

const EXTENSION_PACKAGE_NAME = "pi-context-injector";

interface ImportViolation {
	file: string;
	line: number;
	text: string;
}

function readPackageName(pkgPath: string): string | undefined {
	try {
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: unknown };
		return typeof pkg?.name === "string" ? pkg.name : undefined;
	} catch {
		// Ignore unreadable/invalid package.json and keep searching upward.
	}
	return undefined;
}

function findExtensionRoot(expectedPackageName: string): string {
	let dir = dirname(fileURLToPath(import.meta.url));
	for (let depth = 0; depth < 10; depth++) {
		const pkgPath = join(dir, "package.json");
		if (existsSync(pkgPath) && readPackageName(pkgPath) === expectedPackageName) {
			return dir;
		}

		const parent = dirname(dir);
		if (parent === dir) {
			break;
		}
		dir = parent;
	}

	throw new Error(`Could not locate extension root for "${expectedPackageName}".`);
}

function isProductionTypeScriptFile(fileName: string): boolean {
	return (
		fileName.endsWith(".ts") &&
		!fileName.endsWith(".test.ts") &&
		!fileName.endsWith(".d.ts")
	);
}

function listProductionTypeScriptFiles(rootDir: string): string[] {
	const files: string[] = [];

	const walk = (dir: string): void => {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (EXCLUDED_DIRS.has(entry.name)) {
					continue;
				}
				walk(fullPath);
			} else if (entry.isFile() && isProductionTypeScriptFile(entry.name)) {
				files.push(fullPath);
			}
		}
	};

	walk(rootDir);
	return files.sort();
}

function findSharedZellijModalImports(rootDir: string): ImportViolation[] {
	const violations: ImportViolation[] = [];

	for (const filePath of listProductionTypeScriptFiles(rootDir)) {
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (SHARED_ZELLIJ_MODAL_PATH.test(line)) {
				violations.push({
					file: relative(rootDir, filePath).replace(/\\/g, "/"),
					line: i + 1,
					text: line.trim(),
				});
			}
		}
	}

	return violations.sort((a, b) =>
		a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
	);
}

test("pi-context-injector production sources must not import from the shared zellij-modal extension", () => {
	const extensionRoot = findExtensionRoot(EXTENSION_PACKAGE_NAME);
	const violations = findSharedZellijModalImports(extensionRoot);

	if (violations.length > 0) {
		const details = violations
			.map((v) => `  ${v.file}:${v.line} → ${v.text}`)
			.join("\n");
		assert.fail(
			[
				"pi-context-injector must vendor its own modal code instead of importing from the shared ../../zellij-modal extension.",
				`Found ${violations.length} shared zellij-modal import reference(s) in production source files:`,
				details,
			].join("\n"),
		);
	}
});
