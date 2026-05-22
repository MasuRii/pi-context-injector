import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { COMMAND_NAME, DEFAULT_CONFIG, EXTENSION_NAME } from "./constants.js";
import type { ContextInjectorConfig } from "./types.js";

interface ContextInjectorConfigController {
	getConfig(): ContextInjectorConfig;
	setConfig(next: ContextInjectorConfig, ctx: ExtensionCommandContext): void;
	getConfigPath(): string;
}

interface SettingValueSyncTarget {
	updateValue(id: string, value: string): void;
}

interface ZellijSettingsModalOptions {
	title: string;
	description: string;
	settings: SettingItem[];
	onChange(id: string, newValue: string): void;
	onClose(): void;
	helpText: string;
	enableSearch: boolean;
}

interface ZellijModalRenderResult {
	lines: string[];
}

interface ZellijModalInstance {
	renderModal(width: number): ZellijModalRenderResult;
	invalidate(): void;
	handleInput(data: string): void;
}

type ZellijSettingsModalConstructor = new (
	options: ZellijSettingsModalOptions,
	theme: unknown,
) => SettingValueSyncTarget;

type ZellijModalConstructor = new (content: unknown, config: unknown, theme: unknown) => ZellijModalInstance;

interface ZellijModalModule {
	ZellijModal: ZellijModalConstructor;
	ZellijSettingsModal: ZellijSettingsModalConstructor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isZellijModalModule(value: unknown): value is ZellijModalModule {
	return isRecord(value) && typeof value.ZellijModal === "function" && typeof value.ZellijSettingsModal === "function";
}

async function loadZellijModalModule(): Promise<ZellijModalModule> {
	const modulePath = "../../zellij-modal/index.js";
	const moduleValue: unknown = await import(modulePath);
	if (!isZellijModalModule(moduleValue)) {
		throw new Error("zellij-modal did not expose the expected modal constructors.");
	}
	return moduleValue;
}

const ON_OFF = ["on", "off"];
const INJECTION_TARGET_VALUES = ["user_message", "system_prompt"];
const README_LINE_VALUES = ["30", "50", "100", "150", "250"];
const COMMIT_COUNT_VALUES = ["3", "5", "8", "12", "20"];
const MAX_DEPENDENCY_VALUES = ["10", "15", "25", "40"];
const MAX_RECENT_FILE_VALUES = ["10", "20", "30", "50", "80"];
const RECENT_FILE_AGE_VALUES = ["3", "7", "14", "30"];

function cloneDefaultConfig(): ContextInjectorConfig {
	return {
		...DEFAULT_CONFIG,
		ignoredSections: [...DEFAULT_CONFIG.ignoredSections],
		compaction: {
			...DEFAULT_CONFIG.compaction,
			additionalContext: [...DEFAULT_CONFIG.compaction.additionalContext],
		},
	};
}

function toOnOff(value: boolean): string {
	return value ? "on" : "off";
}

function parseNumber(value: string, fallback: number): number {
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

function summarizeConfig(config: ContextInjectorConfig): string {
	const scope = [
		`enabled=${config.enabled}`,
		`target=${config.injectionTarget}`,
		`readme=${config.enableReadme ? config.readmeLines : "off"}`,
		`git=${config.enableGit ? config.commitCount : "off"}`,
		`workspace=${config.enableWorkspaceState}`,
		`tech=${config.enableTechStack ? config.maxDependencies : "off"}`,
		`compact=${config.compaction.enabled}`,
	];
	return scope.join(", ");
}

function buildSettingItems(config: ContextInjectorConfig): SettingItem[] {
	return [
		{
			id: "enabled",
			label: "Extension enabled",
			description: "Master switch for project and compaction context injection",
			currentValue: toOnOff(config.enabled),
			values: ON_OFF,
		},
		{
			id: "silent",
			label: "Silent injected messages",
			description: "Hide injected context messages from chat while still sending them to the model",
			currentValue: toOnOff(config.silent),
			values: ON_OFF,
		},
		{
			id: "injectionTarget",
			label: "Initial context target",
			description: "user_message is safest; system_prompt is stronger but can override policy hierarchy",
			currentValue: config.injectionTarget,
			values: INJECTION_TARGET_VALUES,
		},
		{
			id: "dynamicFormat",
			label: "Dynamic format",
			description: "Auto-switch XML/Markdown by selected model",
			currentValue: toOnOff(config.dynamicFormat),
			values: ON_OFF,
		},
		{
			id: "enableReadme",
			label: "Include README",
			description: "Inject README excerpt on first prompt",
			currentValue: toOnOff(config.enableReadme),
			values: ON_OFF,
		},
		{
			id: "readmeLines",
			label: "README max lines",
			description: "Upper bound of README lines before pruning",
			currentValue: String(config.readmeLines),
			values: README_LINE_VALUES,
		},
		{
			id: "smartPrune",
			label: "Smart README prune",
			description: "Strip badges/noise and trim long blocks",
			currentValue: toOnOff(config.smartPrune),
			values: ON_OFF,
		},
		{
			id: "enableGit",
			label: "Include git history",
			description: "Inject recent commits on first prompt",
			currentValue: toOnOff(config.enableGit),
			values: ON_OFF,
		},
		{
			id: "commitCount",
			label: "Git commit count",
			description: "Number of latest commits to include",
			currentValue: String(config.commitCount),
			values: COMMIT_COUNT_VALUES,
		},
		{
			id: "enableWorkspaceState",
			label: "Include workspace status",
			description: "Inject staged/unstaged/untracked state",
			currentValue: toOnOff(config.enableWorkspaceState),
			values: ON_OFF,
		},
		{
			id: "enableTechStack",
			label: "Include tech stack",
			description: "Inject dependencies parsed from known manifests",
			currentValue: toOnOff(config.enableTechStack),
			values: ON_OFF,
		},
		{
			id: "maxDependencies",
			label: "Max dependencies",
			description: "Limit dependencies per language manifest",
			currentValue: String(config.maxDependencies),
			values: MAX_DEPENDENCY_VALUES,
		},
		{
			id: "skipForkedSessions",
			label: "Skip forked parent-linked sessions",
			description: "Only skips sessions whose header explicitly includes parentSession",
			currentValue: toOnOff(config.skipForkedSessions),
			values: ON_OFF,
		},
		{
			id: "compactionEnabled",
			label: "Compaction context",
			description: "Inject state snapshot after compaction",
			currentValue: toOnOff(config.compaction.enabled),
			values: ON_OFF,
		},
		{
			id: "compactionWorkspace",
			label: "Compaction: workspace",
			description: "Include git workspace state after compaction",
			currentValue: toOnOff(config.compaction.injectWorkspaceState),
			values: ON_OFF,
		},
		{
			id: "compactionTechStack",
			label: "Compaction: tech stack",
			description: "Include tech stack in compaction context",
			currentValue: toOnOff(config.compaction.injectTechStack),
			values: ON_OFF,
		},
		{
			id: "compactionActiveFiles",
			label: "Compaction: recent files",
			description: "Include recently touched files from git log",
			currentValue: toOnOff(config.compaction.injectActiveFiles),
			values: ON_OFF,
		},
		{
			id: "compactionTodoState",
			label: "Compaction: todo state",
			description: "Include latest todo tool state when present",
			currentValue: toOnOff(config.compaction.injectTodoState),
			values: ON_OFF,
		},
		{
			id: "maxRecentFiles",
			label: "Compaction: max recent files",
			description: "Maximum files pulled from recent git history",
			currentValue: String(config.compaction.maxRecentFiles),
			values: MAX_RECENT_FILE_VALUES,
		},
		{
			id: "recentFilesMaxAge",
			label: "Compaction: recent file max age (days)",
			description: "Only include files changed in this age window",
			currentValue: String(config.compaction.recentFilesMaxAge),
			values: RECENT_FILE_AGE_VALUES,
		},
		{
			id: "debug",
			label: "Debug logging",
			description: "Write debug logs under the extension debug directory",
			currentValue: toOnOff(config.debug),
			values: ON_OFF,
		},
	];
}

function applySetting(config: ContextInjectorConfig, id: string, value: string): ContextInjectorConfig {
	switch (id) {
		case "enabled":
			return { ...config, enabled: value === "on" };
		case "silent":
			return { ...config, silent: value === "on" };
		case "injectionTarget":
			return {
				...config,
				injectionTarget: value === "system_prompt" ? "system_prompt" : "user_message",
			};
		case "dynamicFormat":
			return { ...config, dynamicFormat: value === "on" };
		case "enableReadme":
			return { ...config, enableReadme: value === "on" };
		case "readmeLines":
			return { ...config, readmeLines: parseNumber(value, config.readmeLines) };
		case "smartPrune":
			return { ...config, smartPrune: value === "on" };
		case "enableGit":
			return { ...config, enableGit: value === "on" };
		case "commitCount":
			return { ...config, commitCount: parseNumber(value, config.commitCount) };
		case "enableWorkspaceState":
			return { ...config, enableWorkspaceState: value === "on" };
		case "enableTechStack":
			return { ...config, enableTechStack: value === "on" };
		case "maxDependencies":
			return { ...config, maxDependencies: parseNumber(value, config.maxDependencies) };
		case "skipForkedSessions":
			return { ...config, skipForkedSessions: value === "on" };
		case "compactionEnabled":
			return { ...config, compaction: { ...config.compaction, enabled: value === "on" } };
		case "compactionWorkspace":
			return { ...config, compaction: { ...config.compaction, injectWorkspaceState: value === "on" } };
		case "compactionTechStack":
			return { ...config, compaction: { ...config.compaction, injectTechStack: value === "on" } };
		case "compactionActiveFiles":
			return { ...config, compaction: { ...config.compaction, injectActiveFiles: value === "on" } };
		case "compactionTodoState":
			return { ...config, compaction: { ...config.compaction, injectTodoState: value === "on" } };
		case "maxRecentFiles":
			return {
				...config,
				compaction: { ...config.compaction, maxRecentFiles: parseNumber(value, config.compaction.maxRecentFiles) },
			};
		case "recentFilesMaxAge":
			return {
				...config,
				compaction: {
					...config.compaction,
					recentFilesMaxAge: parseNumber(value, config.compaction.recentFilesMaxAge),
				},
			};
		case "debug":
			return { ...config, debug: value === "on" };
		default:
			return config;
	}
}

function syncSettingValues(settingsList: SettingValueSyncTarget, config: ContextInjectorConfig): void {
	settingsList.updateValue("enabled", toOnOff(config.enabled));
	settingsList.updateValue("silent", toOnOff(config.silent));
	settingsList.updateValue("injectionTarget", config.injectionTarget);
	settingsList.updateValue("dynamicFormat", toOnOff(config.dynamicFormat));
	settingsList.updateValue("enableReadme", toOnOff(config.enableReadme));
	settingsList.updateValue("readmeLines", String(config.readmeLines));
	settingsList.updateValue("smartPrune", toOnOff(config.smartPrune));
	settingsList.updateValue("enableGit", toOnOff(config.enableGit));
	settingsList.updateValue("commitCount", String(config.commitCount));
	settingsList.updateValue("enableWorkspaceState", toOnOff(config.enableWorkspaceState));
	settingsList.updateValue("enableTechStack", toOnOff(config.enableTechStack));
	settingsList.updateValue("maxDependencies", String(config.maxDependencies));
	settingsList.updateValue("skipForkedSessions", toOnOff(config.skipForkedSessions));
	settingsList.updateValue("compactionEnabled", toOnOff(config.compaction.enabled));
	settingsList.updateValue("compactionWorkspace", toOnOff(config.compaction.injectWorkspaceState));
	settingsList.updateValue("compactionTechStack", toOnOff(config.compaction.injectTechStack));
	settingsList.updateValue("compactionActiveFiles", toOnOff(config.compaction.injectActiveFiles));
	settingsList.updateValue("compactionTodoState", toOnOff(config.compaction.injectTodoState));
	settingsList.updateValue("maxRecentFiles", String(config.compaction.maxRecentFiles));
	settingsList.updateValue("recentFilesMaxAge", String(config.compaction.recentFilesMaxAge));
	settingsList.updateValue("debug", toOnOff(config.debug));
}

async function openSettingsModal(ctx: ExtensionCommandContext, controller: ContextInjectorConfigController): Promise<void> {
	const overlayOptions = { anchor: "center" as const, width: 82, maxHeight: "85%" as const, margin: 1 };
	const zellijModalModule = await loadZellijModalModule();

	await ctx.ui.custom<void>(
		(tui, theme, _keybindings, done) => {
			let current = controller.getConfig();
			let settingsModal: SettingValueSyncTarget | null = null;

			settingsModal = new zellijModalModule.ZellijSettingsModal(
				{
					title: "Context Injector Settings",
					description: "Project context injection for first-turn + compaction continuity",
					settings: buildSettingItems(current),
					onChange: (id: string, newValue: string) => {
						current = applySetting(current, id, newValue);
						controller.setConfig(current, ctx);
						current = controller.getConfig();
						if (settingsModal) {
							syncSettingValues(settingsModal, current);
						}
					},
					onClose: () => done(),
					helpText: `/${COMMAND_NAME} show • ${controller.getConfigPath()}`,
					enableSearch: true,
				},
				theme,
			);

			const modal = new zellijModalModule.ZellijModal(
				settingsModal,
				{
					borderStyle: "rounded",
					titleBar: {
						left: "Context Injector Settings",
						right: EXTENSION_NAME,
					},
					helpUndertitle: {
						text: "Esc: close | ↑↓: navigate | Space: toggle",
						color: "dim",
					},
					overlay: overlayOptions,
				},
				theme,
			);

			return {
				render(width: number) {
					return modal.renderModal(width).lines;
				},
				invalidate() {
					modal.invalidate();
				},
				handleInput(data: string) {
					modal.handleInput(data);
					tui.requestRender();
				},
			};
		},
		{ overlay: true, overlayOptions },
	);
}

function handleArgs(args: string, ctx: ExtensionCommandContext, controller: ContextInjectorConfigController): boolean {
	const normalized = args.trim().toLowerCase();
	if (!normalized) {
		return false;
	}

	if (normalized === "show") {
		ctx.ui.notify(`${EXTENSION_NAME}: ${summarizeConfig(controller.getConfig())}`, "info");
		return true;
	}

	if (normalized === "path") {
		ctx.ui.notify(`${EXTENSION_NAME} config: ${controller.getConfigPath()}`, "info");
		return true;
	}

	if (normalized === "reset") {
		controller.setConfig(cloneDefaultConfig(), ctx);
		ctx.ui.notify("Context injector settings reset to defaults.", "info");
		return true;
	}

	ctx.ui.notify(`Usage: /${COMMAND_NAME} [show|path|reset]`, "warning");
	return true;
}

export function registerContextInjectorCommand(pi: ExtensionAPI, controller: ContextInjectorConfigController): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "Configure project context injection",
		handler: async (args, ctx) => {
			if (handleArgs(args, ctx, controller)) {
				return;
			}

			if (!ctx.hasUI) {
				ctx.ui.notify(`/${COMMAND_NAME} requires interactive TUI mode.`, "warning");
				return;
			}

			try {
				await openSettingsModal(ctx, controller);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Failed to open ${EXTENSION_NAME} settings: ${message}`, "warning");
			}
		},
	});
}
