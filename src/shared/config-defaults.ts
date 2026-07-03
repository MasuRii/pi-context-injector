import { DEFAULT_CONFIG } from "../constants.js";
import type { CompactionConfig, ContextInjectorConfig } from "../types.js";

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

export function cloneDefaultConfig(): ContextInjectorConfig {
	return {
		...DEFAULT_CONFIG,
		ignoredSections: [...DEFAULT_CONFIG.ignoredSections],
		compaction: cloneCompactionDefaults(),
	};
}
