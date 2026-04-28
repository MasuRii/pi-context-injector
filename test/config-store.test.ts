import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CONFIG } from "../src/constants.js";
import { normalizeContextInjectorConfig } from "../src/config-store.js";

test("normalizeContextInjectorConfig clamps numeric settings and preserves valid arrays", () => {
	const config = normalizeContextInjectorConfig({
		readmeLines: 999,
		commitCount: 0,
		maxDependencies: 1000,
		maxCodeBlockLines: -1,
		ignoredSections: ["Roadmap", "", 123],
		compaction: {
			maxRecentFiles: 999,
			recentFilesMaxAge: 0,
			additionalContext: ["remember release checklist", false],
		},
	});

	assert.equal(config.readmeLines, 400);
	assert.equal(config.commitCount, 1);
	assert.equal(config.maxDependencies, 80);
	assert.equal(config.maxCodeBlockLines, 0);
	assert.deepEqual(config.ignoredSections, ["Roadmap"]);
	assert.equal(config.compaction.maxRecentFiles, 120);
	assert.equal(config.compaction.recentFilesMaxAge, 1);
	assert.deepEqual(config.compaction.additionalContext, ["remember release checklist"]);
});

test("normalizeContextInjectorConfig defaults invalid values without mutating shared defaults", () => {
	const config = normalizeContextInjectorConfig({
		enabled: "yes",
		injectionTarget: "invalid",
		ignoredSections: [],
		compaction: {
			additionalContext: [],
		},
	});

	assert.equal(config.enabled, DEFAULT_CONFIG.enabled);
	assert.equal(config.injectionTarget, "user_message");
	assert.deepEqual(config.ignoredSections, DEFAULT_CONFIG.ignoredSections);
	assert.notEqual(config.ignoredSections, DEFAULT_CONFIG.ignoredSections);
	assert.deepEqual(config.compaction.additionalContext, DEFAULT_CONFIG.compaction.additionalContext);
	assert.notEqual(config.compaction.additionalContext, DEFAULT_CONFIG.compaction.additionalContext);
});
