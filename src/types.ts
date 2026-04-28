export type ContextFormat = "xml" | "markdown";
export type InjectionTarget = "user_message" | "system_prompt";

export interface CompactionConfig {
	enabled: boolean;
	injectWorkspaceState: boolean;
	injectTechStack: boolean;
	injectActiveFiles: boolean;
	injectTodoState: boolean;
	maxRecentFiles: number;
	recentFilesMaxAge: number;
	additionalContext: string[];
}

export interface ContextInjectorConfig {
	enabled: boolean;
	silent: boolean;
	injectionTarget: InjectionTarget;
	dynamicFormat: boolean;
	readmeLines: number;
	commitCount: number;
	enableReadme: boolean;
	enableGit: boolean;
	enableWorkspaceState: boolean;
	enableTechStack: boolean;
	maxDependencies: number;
	smartPrune: boolean;
	stripBold: boolean;
	pruneLicense: boolean;
	stripHtmlComments: boolean;
	maxCodeBlockLines: number;
	stripNavigationLinks: boolean;
	stripDetailsTags: boolean;
	ignoredSections: string[];
	skipForkedSessions: boolean;
	debug: boolean;
	compaction: CompactionConfig;
}

export type ConfigSource = "primary" | "legacy" | "fallback";

export interface ConfigLoadResult {
	config: ContextInjectorConfig;
	source: ConfigSource;
	warning?: string;
}

export interface EnsureConfigResult {
	created: boolean;
	error?: string;
}

export interface ConfigSaveResult {
	success: boolean;
	error?: string;
}

export interface BuildContextResult {
	block: string | null;
	sectionNames: string[];
	warnings: string[];
}

export interface TodoSnapshot {
	pending: string[];
	inProgress: string[];
	completed: string[];
}
