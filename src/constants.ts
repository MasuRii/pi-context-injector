import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContextInjectorConfig } from "./types.js";

export const EXTENSION_NAME = "pi-context-injector";
export const COMMAND_NAME = "context-injector";
export const PROJECT_CONTEXT_TYPE = `${EXTENSION_NAME}.project-context`;
export const COMPACTION_CONTEXT_TYPE = `${EXTENSION_NAME}.compaction-context`;

export function resolveExtensionRoot(moduleUrl = import.meta.url): string {
	const modulePath = fileURLToPath(moduleUrl);
	const moduleDir = dirname(modulePath);
	return basename(moduleDir) === "src" ? dirname(moduleDir) : moduleDir;
}

export const EXTENSION_ROOT = resolveExtensionRoot();
export const CONFIG_PATH = join(EXTENSION_ROOT, "config.json");
export const LEGACY_CONFIG_PATH = join(homedir(), ".config", "opencode", "context-injector.jsonc");

export const DEBUG_DIR = join(EXTENSION_ROOT, "debug");
export const DEBUG_LOG_PATH = join(DEBUG_DIR, `${EXTENSION_NAME}-debug.log`);

export const DEFAULT_CONFIG: ContextInjectorConfig = {
	enabled: true,
	silent: true,
	injectionTarget: "user_message",
	dynamicFormat: true,
	readmeLines: 50,
	commitCount: 5,
	enableReadme: true,
	enableGit: true,
	enableWorkspaceState: true,
	enableTechStack: true,
	maxDependencies: 15,
	smartPrune: true,
	stripBold: true,
	pruneLicense: true,
	stripHtmlComments: true,
	maxCodeBlockLines: 15,
	stripNavigationLinks: true,
	stripDetailsTags: true,
	ignoredSections: ["Sponsors", "Contributors", "Backers", "Acknowledgements", "Changelog", "Donate"],
	skipForkedSessions: true,
	debug: false,
	compaction: {
		enabled: true,
		injectWorkspaceState: true,
		injectTechStack: false,
		injectActiveFiles: true,
		injectTodoState: true,
		maxRecentFiles: 20,
		recentFilesMaxAge: 7,
		additionalContext: [],
	},
};

export const DEFAULT_CONFIG_CONTENT = `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`;

export const README_CANDIDATES = ["README.md", "README.txt", "readme.md", "Readme.md", "README"];
