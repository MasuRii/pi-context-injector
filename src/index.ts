import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
	COMPACTION_CONTEXT_TYPE,
	DEFAULT_CONFIG,
	EXTENSION_NAME,
	LEGACY_CONFIG_PATH,
	PROJECT_CONTEXT_TYPE,
} from "./constants.js";
import {
	ensureConfigExists,
	getContextInjectorConfigPath,
	loadContextInjectorConfig,
	normalizeContextInjectorConfig,
	saveContextInjectorConfig,
} from "./config-store.js";
import {
	buildCompactionContext,
	buildProjectContext,
	detectFormat,
	extractTodoSnapshotFromBranch,
} from "./context-builder.js";
import { registerContextInjectorCommand } from "./config-modal.js";
import { ContextInjectorLogger } from "./logger.js";
import type { ContextInjectorConfig } from "./types.js";

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

function getSessionKey(ctx: ExtensionContext): string {
	return ctx.sessionManager.getSessionFile() ?? ctx.sessionManager.getSessionId();
}

function sessionAlreadyHasInjectedProjectContext(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => {
		if (entry.type !== "message") {
			return false;
		}
		const message = entry.message as { role?: string; customType?: string };
		return message.role === "custom" && message.customType === PROJECT_CONTEXT_TYPE;
	});
}

function sessionAlreadyHasAssistantReply(ctx: ExtensionContext): boolean {
	return ctx.sessionManager.getEntries().some((entry) => {
		if (entry.type !== "message") {
			return false;
		}
		const message = entry.message as { role?: string };
		return message.role === "assistant";
	});
}

function isParentLinkedSession(ctx: ExtensionContext): boolean {
	const header = ctx.sessionManager.getHeader();
	return Boolean(header?.parentSession);
}

function shouldSkipParentLinkedSessionContext(config: ContextInjectorConfig, ctx: ExtensionContext): boolean {
	return config.skipForkedSessions && isParentLinkedSession(ctx);
}

export default function contextInjectorExtension(pi: ExtensionAPI): void {
	let config: ContextInjectorConfig = cloneDefaultConfig();
	let pendingLoadWarning: string | undefined;
	const warnedMessages = new Set<string>();
	// before_agent_start runs for every prompt, but project context should only be
	// decided once per session: inject on the first eligible turn, then never
	// reinject on later turns in that same session.
	const initialProjectContextHandledSessions = new Set<string>();
	const compactionBlockBySession = new Map<string, string>();
	const logger = new ContextInjectorLogger(() => config.debug);

	const warnOnce = (message: string, ctx?: Pick<ExtensionContext, "hasUI" | "ui">): void => {
		if (warnedMessages.has(message)) {
			return;
		}

		warnedMessages.add(message);
		logger.warn(message);
		if (ctx?.hasUI) {
			ctx.ui.notify(message, "warning");
		}
	};

	const refreshConfig = (ctx?: Pick<ExtensionContext, "hasUI" | "ui">): void => {
		const ensureResult = ensureConfigExists();
		if (ensureResult.error) {
			warnOnce(ensureResult.error, ctx);
		}

		const loaded = loadContextInjectorConfig();
		config = loaded.config;
		pendingLoadWarning = loaded.warning;

		if (loaded.source === "legacy") {
			warnOnce(
				`${EXTENSION_NAME}: using legacy config ${LEGACY_CONFIG_PATH}. Create ${getContextInjectorConfigPath()} to override it.`,
				ctx,
			);
		}
	};

	const setConfig = (next: ContextInjectorConfig, ctx: ExtensionCommandContext): void => {
		config = normalizeContextInjectorConfig(next);
		const saved = saveContextInjectorConfig(config);
		if (!saved.success && saved.error) {
			ctx.ui.notify(saved.error, "error");
		}
	};

	registerContextInjectorCommand(pi, {
		getConfig: () => config,
		setConfig,
		getConfigPath: getContextInjectorConfigPath,
	});

	pi.on("session_start", async (_event, ctx) => {
		refreshConfig(ctx);
		if (pendingLoadWarning) {
			warnOnce(pendingLoadWarning, ctx);
			pendingLoadWarning = undefined;
		}
	});


	pi.on("before_agent_start", async (event, ctx) => {
		if (!config.enabled) {
			return {};
		}

		const sessionKey = getSessionKey(ctx);
		if (initialProjectContextHandledSessions.has(sessionKey)) {
			return {};
		}

		if (shouldSkipParentLinkedSessionContext(config, ctx)) {
			initialProjectContextHandledSessions.add(sessionKey);
			logger.debug("Skipped initial project context for parent-linked session", { sessionKey });
			return {};
		}

		if (sessionAlreadyHasInjectedProjectContext(ctx) || sessionAlreadyHasAssistantReply(ctx)) {
			initialProjectContextHandledSessions.add(sessionKey);
			return {};
		}

		try {
			const format = detectFormat(config, ctx.model);
			const built = await buildProjectContext(ctx.cwd, format, config, logger);
			if (!built.block) {
				initialProjectContextHandledSessions.add(sessionKey);
				logger.debug("No project context sources available for initial session injection.", { sessionKey });
				return {};
			}

			initialProjectContextHandledSessions.add(sessionKey);
			logger.debug("Injecting initial project context", {
				sessionKey,
				format,
				sections: built.sectionNames,
				target: config.injectionTarget,
			});

			if (config.injectionTarget === "system_prompt") {
				return {
					systemPrompt: `${event.systemPrompt}\n\n${built.block}`,
				};
			}

			return {
				message: {
					customType: PROJECT_CONTEXT_TYPE,
					content: built.block,
					display: !config.silent,
					details: {
						format,
						sections: built.sectionNames,
						generatedAt: new Date().toISOString(),
					},
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			warnOnce(`${EXTENSION_NAME}: failed to inject project context: ${message}`, ctx);
			return {};
		}
	});

	pi.on("session_compact", async (_event, ctx) => {
		if (!config.enabled || !config.compaction.enabled) {
			return;
		}

		if (shouldSkipParentLinkedSessionContext(config, ctx)) {
			return;
		}

		try {
			const format = detectFormat(config, ctx.model);
			const todoSnapshot = extractTodoSnapshotFromBranch(ctx.sessionManager.getBranch() as unknown[]);
			const built = await buildCompactionContext(ctx.cwd, format, config, logger, todoSnapshot);
			if (!built.block) {
				logger.debug("Compaction context generation skipped (no sections).", { session: getSessionKey(ctx) });
				return;
			}

			const sessionKey = getSessionKey(ctx);
			if (compactionBlockBySession.get(sessionKey) === built.block) {
				logger.debug("Compaction context unchanged; skipping reinjection.", { sessionKey });
				return;
			}

			compactionBlockBySession.set(sessionKey, built.block);

			pi.sendMessage(
				{
					customType: COMPACTION_CONTEXT_TYPE,
					content: built.block,
					display: !config.silent,
					details: {
						format,
						sections: built.sectionNames,
						generatedAt: new Date().toISOString(),
					},
				},
				{ triggerTurn: false },
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			warnOnce(`${EXTENSION_NAME}: failed to inject compaction context: ${message}`, ctx);
		}
	});
}
