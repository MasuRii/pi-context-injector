import { createHash } from "node:crypto";

import { COMPACTION_CONTEXT_TYPE } from "./constants.js";

export const COMPACTION_CONTEXT_SCHEMA_VERSION = 1;

export interface CompactionContextMetadata {
	schemaVersion: number;
	compactionEntryId?: string;
	contextHash: string;
}

interface CompactionContextLookup {
	compactionEntryId?: string;
	contextHash: string;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function normalizeText(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getEntryType(entry: unknown): string | undefined {
	return normalizeText(asRecord(entry)?.type);
}

function getEntryId(entry: unknown): string | undefined {
	return normalizeText(asRecord(entry)?.id);
}

function getCustomMessageRecord(entry: unknown): Record<string, unknown> | undefined {
	const entryRecord = asRecord(entry);
	if (!entryRecord) {
		return undefined;
	}

	if (entryRecord.type === "custom_message") {
		return entryRecord;
	}

	if (entryRecord.type === "message") {
		const messageRecord = asRecord(entryRecord.message);
		if (messageRecord?.role === "custom") {
			return messageRecord;
		}
	}

	return undefined;
}

function getLatestCompactionIndex(entries: readonly unknown[]): number {
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		if (getEntryType(entries[index]) === "compaction") {
			return index;
		}
	}

	return -1;
}

function getCompactionEntryIndex(entries: readonly unknown[], compactionEntryId: string | undefined): number {
	if (!compactionEntryId) {
		return getLatestCompactionIndex(entries);
	}

	const exactIndex = entries.findIndex((entry) => getEntryType(entry) === "compaction" && getEntryId(entry) === compactionEntryId);
	return exactIndex >= 0 ? exactIndex : getLatestCompactionIndex(entries);
}

function customMessageMatchesCompactionContext(
	messageRecord: Record<string, unknown>,
	lookup: CompactionContextLookup,
): boolean {
	if (messageRecord.customType !== COMPACTION_CONTEXT_TYPE) {
		return false;
	}

	const details = asRecord(messageRecord.details);
	if (!details || details.contextHash !== lookup.contextHash) {
		return false;
	}

	const existingCompactionEntryId = normalizeText(details.compactionEntryId);
	return !lookup.compactionEntryId || !existingCompactionEntryId || existingCompactionEntryId === lookup.compactionEntryId;
}

export function createCompactionContextHash(block: string): string {
	return createHash("sha256").update(block, "utf8").digest("hex");
}

export function createCompactionContextMetadata(
	lookup: CompactionContextLookup,
): CompactionContextMetadata {
	return {
		schemaVersion: COMPACTION_CONTEXT_SCHEMA_VERSION,
		compactionEntryId: lookup.compactionEntryId,
		contextHash: lookup.contextHash,
	};
}

export function sessionAlreadyHasCompactionContext(
	entries: readonly unknown[],
	lookup: CompactionContextLookup,
): boolean {
	const compactionIndex = getCompactionEntryIndex(entries, lookup.compactionEntryId);
	if (compactionIndex < 0) {
		return false;
	}

	for (let index = compactionIndex + 1; index < entries.length; index += 1) {
		const messageRecord = getCustomMessageRecord(entries[index]);
		if (messageRecord && customMessageMatchesCompactionContext(messageRecord, lookup)) {
			return true;
		}
	}

	return false;
}
