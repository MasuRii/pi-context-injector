import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DEFAULT_CONFIG } from "../src/constants.js";
import {
	detectFormat,
	extractTodoSnapshotFromBranch,
	buildProjectContext,
} from "../src/context-builder.js";
import { ContextInjectorLogger } from "../src/logger.js";

const silentLogger = new ContextInjectorLogger(() => false);

test("detectFormat keeps XML for Claude and XML-preferred model families", () => {
	assert.equal(detectFormat(DEFAULT_CONFIG, { provider: "anthropic", id: "claude-sonnet-4.5" }), "xml");
	assert.equal(detectFormat(DEFAULT_CONFIG, { provider: "openai", id: "gpt-5-codex" }), "xml");
});

test("detectFormat returns markdown for non-XML model families when dynamic formatting is enabled", () => {
	assert.equal(detectFormat(DEFAULT_CONFIG, { provider: "openai", id: "gpt-4.1" }), "markdown");
});

test("extractTodoSnapshotFromBranch returns the latest non-empty todo tool snapshot", () => {
	const snapshot = extractTodoSnapshotFromBranch([
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo",
				details: { todos: [{ text: "older task", status: "completed" }] },
			},
		},
		{
			type: "message",
			message: {
				role: "toolResult",
				toolName: "todo",
				details: {
					todos: [
						{ text: "ship context tests", status: "in_progress" },
						{ content: "publish package", done: false },
						{ text: "write changelog", done: true },
						{ text: "   " },
					],
				},
			},
		},
	]);

	assert.deepEqual(snapshot, {
		inProgress: ["ship context tests"],
		pending: ["publish package"],
		completed: ["write changelog"],
	});
});

test("buildProjectContext renders README and tech stack sections without git or workspace context", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-"));
	await writeFile(join(cwd, "README.md"), "# Demo\n\n<!-- hidden -->\n\n![badge](https://example.test/badge.svg)\n\n## Usage\n\nRun **Pi** safely.\n", "utf-8");
	await writeFile(join(cwd, "package.json"), JSON.stringify({ name: "demo", dependencies: { zod: "latest" } }), "utf-8");

	const result = await buildProjectContext(cwd, "markdown", {
		...DEFAULT_CONFIG,
		enableGit: false,
		enableWorkspaceState: false,
		enableTechStack: true,
		stripBold: true,
		readmeLines: 20,
	}, silentLogger);

	assert.deepEqual(result.sectionNames, ["readme", "tech_stack"]);
	assert.match(result.block ?? "", /# project_context/);
	assert.match(result.block ?? "", /Run Pi safely\./);
	assert.match(result.block ?? "", /zod/);
	assert.doesNotMatch(result.block ?? "", /hidden|badge|\*\*/);
});

test("pruneReadme still works with an oversized ignored section name (length-limited)", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-redos-"));
	const oversizedSection = "a".repeat(600);
	await writeFile(join(cwd, "README.md"), "# Demo\n\n## Usage\n\nKeep.\n\n## License\n\nMIT\n", "utf-8");

	const result = await buildProjectContext(cwd, "markdown", {
		...DEFAULT_CONFIG,
		enableGit: false,
		enableWorkspaceState: false,
		enableTechStack: false,
		stripBold: false,
		readmeLines: 20,
		ignoredSections: [oversizedSection],
	}, silentLogger);

	assert.deepEqual(result.sectionNames, ["readme"]);
	assert.match(result.block ?? "", /Keep\./);
	assert.match(result.block ?? "", /MIT/);
});
