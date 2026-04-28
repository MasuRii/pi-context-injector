import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	CONFIG_PATH,
	DEFAULT_CONFIG,
	DEFAULT_CONFIG_CONTENT,
	EXTENSION_NAME,
	LEGACY_CONFIG_PATH,
} from "./constants.js";
import { parseJsonc } from "./jsonc.js";
import type {
	CompactionConfig,
	ConfigLoadResult,
	ConfigSaveResult,
	ContextInjectorConfig,
	EnsureConfigResult,
	InjectionTarget,
} from "./types.js";

function toObject(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, unknown>;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function toStringArray(value: unknown, fallback: string[] = []): string[] {
	if (!Array.isArray(value)) {
		return [...fallback];
	}

	const result = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
	return result.length > 0 ? result : [...fallback];
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return fallback;
	}
	const floored = Math.floor(value);
	if (floored < min) return min;
	if (floored > max) return max;
	return floored;
}

function toInjectionTarget(value: unknown): InjectionTarget {
	return value === "system_prompt" ? "system_prompt" : "user_message";
}

function cloneCompactionDefaults(): CompactionConfig {
	return {
		enabled: DEFAULT_CONFIG.compaction.enabled,
		injectWorkspaceState: DEFAULT_CONFIG.compaction.injectWorkspaceState,
		injectTechStack: DEFAULT_CONFIG.compaction.injectTechStack,
		injectActiveFiles: DEFAULT_CONFIG.compaction.injectActiveFiles,
		injectTodoState: DEFAULT_CONFIG.compaction.injectTodoState,
		maxRecentFiles: DEFAULT_CONFIG.compaction.maxRecentFiles,
		recentFilesMaxAge: DEFAULT_CONFIG.compaction.recentFilesMaxAge,
		additionalContext: [...DEFAULT_CONFIG.compaction.additionalContext],
	};
}

function cloneDefaultConfig(): ContextInjectorConfig {
	return {
		...DEFAULT_CONFIG,
		ignoredSections: [...DEFAULT_CONFIG.ignoredSections],
		compaction: cloneCompactionDefaults(),
	};
}

export function normalizeContextInjectorConfig(raw: unknown): ContextInjectorConfig {
	const source = toObject(raw);
	const compactionRaw = toObject(source.compaction);

	return {
		enabled: toBoolean(source.enabled, DEFAULT_CONFIG.enabled),
		silent: toBoolean(source.silent, DEFAULT_CONFIG.silent),
		injectionTarget: toInjectionTarget(source.injectionTarget),
		dynamicFormat: toBoolean(source.dynamicFormat, DEFAULT_CONFIG.dynamicFormat),
		readmeLines: clampNumber(source.readmeLines, 10, 400, DEFAULT_CONFIG.readmeLines),
		commitCount: clampNumber(source.commitCount, 1, 50, DEFAULT_CONFIG.commitCount),
		enableReadme: toBoolean(source.enableReadme, DEFAULT_CONFIG.enableReadme),
		enableGit: toBoolean(source.enableGit, DEFAULT_CONFIG.enableGit),
		enableWorkspaceState: toBoolean(source.enableWorkspaceState, DEFAULT_CONFIG.enableWorkspaceState),
		enableTechStack: toBoolean(source.enableTechStack, DEFAULT_CONFIG.enableTechStack),
		maxDependencies: clampNumber(source.maxDependencies, 3, 80, DEFAULT_CONFIG.maxDependencies),
		smartPrune: toBoolean(source.smartPrune, DEFAULT_CONFIG.smartPrune),
		stripBold: toBoolean(source.stripBold, DEFAULT_CONFIG.stripBold),
		pruneLicense: toBoolean(source.pruneLicense, DEFAULT_CONFIG.pruneLicense),
		stripHtmlComments: toBoolean(source.stripHtmlComments, DEFAULT_CONFIG.stripHtmlComments),
		maxCodeBlockLines: clampNumber(source.maxCodeBlockLines, 0, 120, DEFAULT_CONFIG.maxCodeBlockLines),
		stripNavigationLinks: toBoolean(source.stripNavigationLinks, DEFAULT_CONFIG.stripNavigationLinks),
		stripDetailsTags: toBoolean(source.stripDetailsTags, DEFAULT_CONFIG.stripDetailsTags),
		ignoredSections: toStringArray(source.ignoredSections, DEFAULT_CONFIG.ignoredSections),
		skipForkedSessions: toBoolean(
			source.skipForkedSessions,
			toBoolean(source.skipChildSessions, DEFAULT_CONFIG.skipForkedSessions),
		),
		debug: toBoolean(source.debug, DEFAULT_CONFIG.debug),
		compaction: {
			enabled: toBoolean(compactionRaw.enabled, DEFAULT_CONFIG.compaction.enabled),
			injectWorkspaceState: toBoolean(
				compactionRaw.injectWorkspaceState,
				DEFAULT_CONFIG.compaction.injectWorkspaceState,
			),
			injectTechStack: toBoolean(compactionRaw.injectTechStack, DEFAULT_CONFIG.compaction.injectTechStack),
			injectActiveFiles: toBoolean(compactionRaw.injectActiveFiles, DEFAULT_CONFIG.compaction.injectActiveFiles),
			injectTodoState: toBoolean(compactionRaw.injectTodoState, DEFAULT_CONFIG.compaction.injectTodoState),
			maxRecentFiles: clampNumber(compactionRaw.maxRecentFiles, 5, 120, DEFAULT_CONFIG.compaction.maxRecentFiles),
			recentFilesMaxAge: clampNumber(
				compactionRaw.recentFilesMaxAge,
				1,
				120,
				DEFAULT_CONFIG.compaction.recentFilesMaxAge,
			),
			additionalContext: toStringArray(compactionRaw.additionalContext, DEFAULT_CONFIG.compaction.additionalContext),
		},
	};
}

function parseConfig(path: string): ContextInjectorConfig {
	const parsed = parseJsonc(readFileSync(path, "utf-8"));
	return normalizeContextInjectorConfig(parsed);
}

export function ensureConfigExists(): EnsureConfigResult {
	if (existsSync(CONFIG_PATH)) {
		return { created: false };
	}

	try {
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });

		if (existsSync(LEGACY_CONFIG_PATH)) {
			try {
				const legacyConfig = parseConfig(LEGACY_CONFIG_PATH);
				writeFileSync(CONFIG_PATH, `${JSON.stringify(legacyConfig, null, 2)}\n`, "utf-8");
				return { created: true };
			} catch {
				writeFileSync(CONFIG_PATH, DEFAULT_CONFIG_CONTENT, "utf-8");
				return { created: true };
			}
		}

		writeFileSync(CONFIG_PATH, DEFAULT_CONFIG_CONTENT, "utf-8");
		return { created: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			created: false,
			error: `Failed to create ${CONFIG_PATH}: ${message}`,
		};
	}
}

export function loadContextInjectorConfig(): ConfigLoadResult {
	try {
		if (existsSync(CONFIG_PATH)) {
			return { config: parseConfig(CONFIG_PATH), source: "primary" };
		}

		if (existsSync(LEGACY_CONFIG_PATH)) {
			return { config: parseConfig(LEGACY_CONFIG_PATH), source: "legacy" };
		}

		return { config: cloneDefaultConfig(), source: "fallback" };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			config: cloneDefaultConfig(),
			source: "fallback",
			warning: `Failed to load ${EXTENSION_NAME} config: ${message}`,
		};
	}
}

export function saveContextInjectorConfig(config: ContextInjectorConfig): ConfigSaveResult {
	const normalized = normalizeContextInjectorConfig(config);
	const tmpPath = `${CONFIG_PATH}.tmp`;

	try {
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });
		writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
		renameSync(tmpPath, CONFIG_PATH);
		return { success: true };
	} catch (error) {
		try {
			if (existsSync(tmpPath)) {
				unlinkSync(tmpPath);
			}
		} catch {
			// Ignore cleanup errors.
		}
		const message = error instanceof Error ? error.message : String(error);
		return { success: false, error: `Failed to save ${CONFIG_PATH}: ${message}` };
	}
}

export function getContextInjectorConfigPath(): string {
	return CONFIG_PATH;
}
