import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import contextInjectorExtension from "../src/index.js";
import { COMPACTION_CONTEXT_TYPE, COMMAND_NAME, PROJECT_CONTEXT_TYPE } from "../src/constants.js";

function createSessionManager(entries: unknown[] = [], branch: unknown[] = []) {
	return {
		getSessionFile: () => undefined,
		getSessionId: () => "session-1",
		getEntries: () => entries,
		getHeader: () => ({}),
		getBranch: () => branch,
	};
}

function createContext(cwd: string, entries: unknown[] = [], branch: unknown[] = []) {
	return {
		cwd,
		model: { provider: "openai", id: "gpt-4.1" },
		hasUI: false,
		ui: { notify: () => undefined },
		sessionManager: createSessionManager(entries, branch),
	};
}

test("context injector registers command and injects first-turn project context once per session", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-hook-"));
	await writeFile(join(cwd, "README.md"), "# Demo\n\nUseful context.\n", "utf-8");

	const handlers = new Map<string, Function>();
	const commands = new Map<string, unknown>();
	const sentMessages: unknown[] = [];
	contextInjectorExtension({
		on: (event: string, handler: Function) => handlers.set(event, handler),
		registerCommand: (name: string, command: unknown) => commands.set(name, command),
		sendMessage: (message: unknown) => sentMessages.push(message),
	} as never);

	assert.equal(commands.has(COMMAND_NAME), true);
	assert.equal(typeof handlers.get("before_agent_start"), "function");
	assert.equal(typeof handlers.get("session_compact"), "function");

	const ctx = createContext(cwd);
	const event = { systemPrompt: "System prompt" };
	const first = await handlers.get("before_agent_start")?.(event, ctx);
	const second = await handlers.get("before_agent_start")?.(event, ctx);

	assert.equal(first?.message?.customType, PROJECT_CONTEXT_TYPE);
	assert.match(first?.message?.content ?? "", /Useful context/);
	assert.deepEqual(second, {});
	assert.deepEqual(sentMessages, []);
});

test("context injector sends compaction context without triggering a turn", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "pi-context-injector-compact-"));
	await writeFile(join(cwd, "README.md"), "# Demo\n\nCompact context.\n", "utf-8");

	const handlers = new Map<string, Function>();
	const sentMessages: Array<{ message: any; options: any }> = [];
	contextInjectorExtension({
		on: (event: string, handler: Function) => handlers.set(event, handler),
		registerCommand: () => undefined,
		sendMessage: (message: unknown, options: unknown) => sentMessages.push({ message, options }),
	} as never);

	await handlers.get("session_compact")?.(
		{ compactionEntry: { id: "compact-1" } },
		createContext(cwd, [], [
			{
				type: "message",
				message: {
					role: "toolResult",
					toolName: "todo",
					details: { todos: [{ text: "finish compaction tests", status: "in_progress" }] },
				},
			},
		]),
	);

	assert.equal(sentMessages.length, 1);
	assert.equal(sentMessages[0]?.message.customType, COMPACTION_CONTEXT_TYPE);
	assert.match(sentMessages[0]?.message.content ?? "", /finish compaction tests/);
	assert.deepEqual(sentMessages[0]?.options, { triggerTurn: false });
});
