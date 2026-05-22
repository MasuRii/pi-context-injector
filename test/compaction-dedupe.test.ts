import test from "node:test";
import assert from "node:assert/strict";

import { COMPACTION_CONTEXT_TYPE } from "../src/constants.js";
import {
	createCompactionContextHash,
	sessionAlreadyHasCompactionContext,
} from "../src/compaction-dedupe.js";

const block = "# compaction_context\n\nRemember the current workspace state.";
const contextHash = createCompactionContextHash(block);

test("sessionAlreadyHasCompactionContext finds matching persisted compaction metadata", () => {
	const entries = [
		{
			type: "compaction",
			id: "compaction-1",
		},
		{
			type: "message",
			message: {
				role: "custom",
				customType: COMPACTION_CONTEXT_TYPE,
				details: {
					compactionEntryId: "compaction-1",
					contextHash,
				},
			},
		},
	];

	assert.equal(
		sessionAlreadyHasCompactionContext(entries, {
			compactionEntryId: "compaction-1",
			contextHash,
		}),
		true,
	);
});

test("sessionAlreadyHasCompactionContext ignores matching hashes from older compactions", () => {
	const entries = [
		{
			type: "compaction",
			id: "compaction-1",
		},
		{
			type: "message",
			message: {
				role: "custom",
				customType: COMPACTION_CONTEXT_TYPE,
				details: {
					compactionEntryId: "compaction-1",
					contextHash,
				},
			},
		},
		{
			type: "compaction",
			id: "compaction-2",
		},
	];

	assert.equal(
		sessionAlreadyHasCompactionContext(entries, {
			compactionEntryId: "compaction-2",
			contextHash,
		}),
		false,
	);
});

test("sessionAlreadyHasCompactionContext falls back to latest compaction boundary when metadata lacks id", () => {
	const entries = [
		{
			type: "compaction",
			id: "compaction-1",
		},
		{
			type: "message",
			message: {
				role: "custom",
				customType: COMPACTION_CONTEXT_TYPE,
				details: {
					contextHash,
				},
			},
		},
	];

	assert.equal(
		sessionAlreadyHasCompactionContext(entries, {
			compactionEntryId: "compaction-1",
			contextHash,
		}),
		true,
	);
});
