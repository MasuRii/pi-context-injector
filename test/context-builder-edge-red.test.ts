import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DEFAULT_CONFIG } from "../src/constants.js";
import { buildCompactionContext } from "../src/context-builder.js";
import { ContextInjectorLogger } from "../src/logger.js";

const silentLogger = new ContextInjectorLogger(() => false);

test("buildCompactionContext escapes XML metacharacters in operator-provided additional context notes", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-edge-"));

	const result = await buildCompactionContext(cwd, "xml", {
		...DEFAULT_CONFIG,
		stripBold: false,
		compaction: {
			...DEFAULT_CONFIG.compaction,
			injectWorkspaceState: false,
			injectTechStack: false,
			injectActiveFiles: false,
			injectTodoState: false,
			additionalContext: ["Preserve <user_input> & raw paths > generated hints"],
		},
	}, silentLogger, null);

	assert.match(result.block ?? "", /<note>Preserve &lt;user_input&gt; &amp; raw paths &gt; generated hints<\/note>/);
	assert.doesNotMatch(result.block ?? "", /<note>Preserve <user_input> & raw paths > generated hints<\/note>/);
});

test("buildCompactionContext escapes XML metacharacters in todo text captured from prior tool output", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-edge-"));

	const result = await buildCompactionContext(cwd, "xml", {
		...DEFAULT_CONFIG,
		stripBold: false,
		compaction: {
			...DEFAULT_CONFIG.compaction,
			injectWorkspaceState: false,
			injectTechStack: false,
			injectActiveFiles: false,
			injectTodoState: true,
			additionalContext: [],
		},
	}, silentLogger, {
		inProgress: ["Fix <parser> & serializer"],
		pending: ["Review output > token budget"],
		completed: ["Remove malformed </task_state> closer"],
	});

	assert.match(result.block ?? "", /Fix &lt;parser&gt; &amp; serializer/);
	assert.match(result.block ?? "", /Review output &gt; token budget/);
	assert.match(result.block ?? "", /Remove malformed &lt;\/task_state&gt; closer/);
	assert.doesNotMatch(result.block ?? "", /Fix <parser> & serializer/);
	assert.doesNotMatch(result.block ?? "", /Remove malformed <\/task_state> closer/);
});
