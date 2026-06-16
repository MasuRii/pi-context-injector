import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { README_CANDIDATES } from "./constants.js";
import { runCommand } from "./command-runner.js";
import type { BuildContextResult, ContextFormat, ContextInjectorConfig, TodoSnapshot } from "./types.js";

interface ContextBuildLogger {
	debug(message: string, details?: unknown): void;
}

interface ModelLike {
	provider?: string;
	id?: string;
	api?: string;
}

interface SourceResult {
	name: string;
	content: string | null;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

function escapeXmlText(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function toLines(content: string): string[] {
	return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	let lastNonEmpty = lines.length - 1;
	while (lastNonEmpty >= 0 && lines[lastNonEmpty]?.trim().length === 0) {
		lastNonEmpty -= 1;
	}
	return lines.slice(0, Math.max(0, lastNonEmpty + 1));
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\n{3,}/g, "\n\n").trim();
}

function renderSection(
	format: ContextFormat,
	tag: string,
	title: string,
	body: string,
	attributes: Record<string, string> = {},
): string {
	if (format === "xml") {
		const attrText = Object.entries(attributes)
			.map(([key, value]) => ` ${key}="${escapeXmlAttribute(value)}"`)
			.join("");
		return `<${tag}${attrText}>\n${body}\n</${tag}>`;
	}

	return `## ${title}\n${body}`;
}

function finalizeBlock(format: ContextFormat, tag: string, title: string, sections: string[]): string {
	if (format === "xml") {
		return `<${tag}>\n${sections.join("\n")}\n</${tag}>`;
	}

	return `# ${title}\n\n${sections.join("\n\n")}`;
}

function applyBoldStripping(text: string, enabled: boolean): string {
	if (!enabled) {
		return text;
	}
	return text.replace(/\*\*/g, "");
}

function pruneReadme(content: string, config: ContextInjectorConfig): string {
	if (!config.smartPrune) {
		return normalizeWhitespace(content);
	}

	let pruned = content.replace(/\r\n/g, "\n");

	if (config.stripHtmlComments) {
		pruned = pruned.replace(/<!--[\s\S]*?-->/g, "");
	}

	const badgePatterns = [
		/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g,
		/\[!\[[^\]]*\]\[[^\]]*\]\]\[[^\]]*\]/g,
		/!\[[^\]]*\]\([^)]*\)/g,
		/!\[[^\]]*\]\[[^\]]*\]/g,
		/<\s*img[\s\S]*?>/gi,
	];
	for (const pattern of badgePatterns) {
		pruned = pruned.replace(pattern, "");
	}

	pruned = pruned.replace(/^\[[^\]]+\]:\s*https?:\/\/[^\n]*$/gim, "");
	pruned = pruned.replace(/^##\s*Table of Contents[\s\S]*?(?=^##\s|\Z)/gim, "");

	for (const section of config.ignoredSections) {
		const escaped = escapeRegex(section);
		const sectionPattern = new RegExp(`^#{2,3}\\s*${escaped}[\\s\\S]*?(?=^#{2,3}\\s|\\Z)`, "gim");
		pruned = pruned.replace(sectionPattern, "");
	}

	if (config.pruneLicense) {
		pruned = pruned.replace(/^##\s*License[\s\S]*?(?=^##\s|\Z)/gim, "");
	}

	if (config.maxCodeBlockLines > 0) {
		const maxLines = config.maxCodeBlockLines;
		pruned = pruned.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, language: string, code: string) => {
			const codeLines = code.split("\n");
			if (codeLines.length <= maxLines) {
				return `\`\`\`${language}\n${code}\`\`\``;
			}

			const keepTop = Math.min(5, codeLines.length);
			const keepBottom = Math.min(3, Math.max(0, codeLines.length - keepTop));
			const hidden = Math.max(0, codeLines.length - keepTop - keepBottom);
			const top = codeLines.slice(0, keepTop).join("\n");
			const bottom = keepBottom > 0 ? `\n${codeLines.slice(-keepBottom).join("\n")}` : "";
			return `\`\`\`${language}\n${top}\n... (${hidden} lines truncated) ...${bottom}\n\`\`\``;
		});
	}

	if (config.stripNavigationLinks) {
		pruned = pruned.replace(/\[(?:↑\s*)?(?:Back to |↑\s*)?(?:top|Top|TOC)\]\([^)]*\)/g, "");
		pruned = pruned.replace(/\[\s*↑\s*\]\([^)]*\)/g, "");
	}

	if (config.stripDetailsTags) {
		pruned = pruned.replace(
			/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi,
			(_match, summary: string, details: string) => {
				const cleanSummary = summary.replace(/<[^>]+>/g, "").trim();
				return `#### ${cleanSummary}\n\n${details.trim()}`;
			},
		);
		pruned = pruned.replace(/<\/?details>/gi, "");
		pruned = pruned.replace(/<\/?summary>/gi, "");
	}

	return normalizeWhitespace(pruned);
}

async function readExistingFile(path: string): Promise<string | null> {
	if (!existsSync(path)) {
		return null;
	}
	try {
		return await readFile(path, "utf-8");
	} catch {
		return null;
	}
}

async function getReadmeSection(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
): Promise<SourceResult> {
	if (!config.enableReadme) {
		return { name: "readme", content: null };
	}

	for (const candidate of README_CANDIDATES) {
		const path = join(cwd, candidate);
		const raw = await readExistingFile(path);
		if (!raw) {
			continue;
		}

		const lines = toLines(raw).slice(0, config.readmeLines);
		const pruned = pruneReadme(trimTrailingEmptyLines(lines).join("\n"), config);
		if (!pruned) {
			continue;
		}

		const section = renderSection(
			format,
			"readme",
			"README",
			pruned,
			{
				source: candidate,
				truncated: String(lines.length >= config.readmeLines),
				lines: String(config.readmeLines),
			},
		);
		return { name: "readme", content: section };
	}

	logger.debug("No README candidate found for context injection.");
	return { name: "readme", content: null };
}

async function getGitSection(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
): Promise<SourceResult> {
	if (!config.enableGit) {
		return { name: "git", content: null };
	}

	const branchResult = await runCommand("git", ["branch", "--show-current"], cwd);
	const branch = branchResult.ok ? branchResult.stdout.trim() || "detached HEAD" : "unknown";

	const separator = "────────────────────────────────────────";
	const gitFormat = `Commit: %h%nAuthor: %an%nTitle: %s%nBody:%n%b${separator}`;
	const historyResult = await runCommand("git", ["log", "-n", String(config.commitCount), `--format=${gitFormat}`], cwd);
	if (!historyResult.ok) {
		logger.debug("Skipping git history context", { error: historyResult.error, stderr: historyResult.stderr });
		return { name: "git", content: null };
	}

	const history = historyResult.stdout.trim();
	if (!history) {
		return { name: "git", content: null };
	}

	const section = renderSection(format, "git_history", "Git History", history, {
		branch,
		commit_count: String(config.commitCount),
	});
	return { name: "git", content: section };
}

interface WorkspaceBucket {
	staged: Array<{ status: string; file: string }>;
	unstaged: Array<{ status: string; file: string }>;
	untracked: string[];
}

function parseWorkspaceStatus(rawStatus: string): WorkspaceBucket {
	const lines = rawStatus
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.length > 0);

	const bucket: WorkspaceBucket = { staged: [], unstaged: [], untracked: [] };

	for (const line of lines) {
		const match = line.match(/^(.)(.)\s+(.+)$/);
		if (!match) {
			continue;
		}

		const [, indexStatus, worktreeStatus, rawPath] = match;
		const filename = rawPath.includes(" -> ") ? rawPath.split(" -> ").at(-1)?.trim() || rawPath : rawPath.trim();

		if (indexStatus !== " " && indexStatus !== "?") {
			bucket.staged.push({ status: indexStatus, file: filename });
		}

		if (worktreeStatus !== " " && worktreeStatus !== "?") {
			bucket.unstaged.push({ status: worktreeStatus, file: filename });
		}

		if (indexStatus === "?" && worktreeStatus === "?") {
			bucket.untracked.push(filename);
		}
	}

	return bucket;
}

async function getWorkspaceSection(
	cwd: string,
	format: ContextFormat,
	enabled: boolean,
	logger: ContextBuildLogger,
): Promise<SourceResult> {
	if (!enabled) {
		return { name: "workspace", content: null };
	}

	const result = await runCommand("git", ["status", "--porcelain"], cwd);
	if (!result.ok) {
		logger.debug("Skipping workspace status context", { error: result.error, stderr: result.stderr });
		return { name: "workspace", content: null };
	}

	const parsed = parseWorkspaceStatus(result.stdout);
	if (parsed.staged.length === 0 && parsed.unstaged.length === 0 && parsed.untracked.length === 0) {
		return { name: "workspace", content: null };
	}

	if (format === "xml") {
		const xmlParts: string[] = [];
		if (parsed.staged.length > 0) {
			xmlParts.push(
				`<staged count="${parsed.staged.length}">\n${parsed.staged.map((entry) => `${entry.status}  ${entry.file}`).join("\n")}\n</staged>`,
			);
		}
		if (parsed.unstaged.length > 0) {
			xmlParts.push(
				`<unstaged count="${parsed.unstaged.length}">\n${parsed.unstaged.map((entry) => `${entry.status}  ${entry.file}`).join("\n")}\n</unstaged>`,
			);
		}
		if (parsed.untracked.length > 0) {
			const shown = parsed.untracked.slice(0, 10);
			const more = Math.max(0, parsed.untracked.length - shown.length);
			const suffix = more > 0 ? `\n... and ${more} more` : "";
			xmlParts.push(
				`<untracked count="${parsed.untracked.length}"${more > 0 ? ' showing="10"' : ""}>\n${shown.map((file) => `?  ${file}`).join("\n")}${suffix}\n</untracked>`,
			);
		}

		return {
			name: "workspace",
			content: renderSection(format, "workspace_state", "Workspace State", xmlParts.join("\n")),
		};
	}

	const sections: string[] = [];
	if (parsed.staged.length > 0) {
		sections.push(
			`### Staged (${parsed.staged.length})\n${parsed.staged.map((entry) => `- ${entry.status} ${entry.file}`).join("\n")}`,
		);
	}
	if (parsed.unstaged.length > 0) {
		sections.push(
			`### Unstaged (${parsed.unstaged.length})\n${parsed.unstaged.map((entry) => `- ${entry.status} ${entry.file}`).join("\n")}`,
		);
	}
	if (parsed.untracked.length > 0) {
		const shown = parsed.untracked.slice(0, 10);
		const more = Math.max(0, parsed.untracked.length - shown.length);
		sections.push(
			`### Untracked (${parsed.untracked.length})\n${shown.map((file) => `- ? ${file}`).join("\n")}${more > 0 ? `\n- ... and ${more} more` : ""}`,
		);
	}

	return {
		name: "workspace",
		content: renderSection(format, "workspace_state", "Workspace State", sections.join("\n\n")),
	};
}

function parsePackageDependencies(content: string, maxDependencies: number): string[] {
	try {
		const parsed = JSON.parse(content) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};

		const deps: string[] = [];
		for (const [name, version] of Object.entries(parsed.dependencies ?? {})) {
			deps.push(`${name}: ${version}`);
		}
		for (const [name, version] of Object.entries(parsed.devDependencies ?? {})) {
			deps.push(`${name}: ${version} (dev)`);
		}
		return deps.slice(0, maxDependencies);
	} catch {
		return [];
	}
}

function parseRequirementsDependencies(content: string, maxDependencies: number): string[] {
	return content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.slice(0, maxDependencies);
}

function parsePyprojectDependencies(content: string, maxDependencies: number): string[] {
	const depsMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/m);
	if (!depsMatch) {
		return [];
	}

	return depsMatch[1]
		.split("\n")
		.map((line) => line.replace(/[",]/g, "").trim())
		.filter(Boolean)
		.slice(0, maxDependencies);
}

function parseGoMod(content: string, maxDependencies: number): { meta: string; deps: string[] } | null {
	if (!content.trim()) {
		return null;
	}

	const moduleName = content.match(/^module\s+(.+)$/m)?.[1]?.trim() ?? "unknown";
	const goVersion = content.match(/^go\s+(.+)$/m)?.[1]?.trim() ?? "n/a";
	const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/m)?.[1] ?? "";
	const deps = requireBlock
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("//"))
		.slice(0, maxDependencies);

	return { meta: `module=${moduleName}, go=${goVersion}`, deps };
}

function parseCargo(content: string, maxDependencies: number): { meta: string; deps: string[] } | null {
	if (!content.trim()) {
		return null;
	}

	const crate = content.match(/^\s*name\s*=\s*"(.+)"/m)?.[1] ?? "unknown";
	const version = content.match(/^\s*version\s*=\s*"(.+)"/m)?.[1] ?? "n/a";
	const dependencyBlock = content.match(/\[dependencies\]([\s\S]*?)(?:\n\[|\Z)/m)?.[1] ?? "";
	const deps = dependencyBlock
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0 && !line.startsWith("#") && line.includes("="))
		.slice(0, maxDependencies);

	return { meta: `crate=${crate}, version=${version}`, deps };
}

async function getTechStackSection(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
): Promise<SourceResult> {
	if (!config.enableTechStack) {
		return { name: "tech_stack", content: null };
	}

	const sections: string[] = [];

	const packageJson = await readExistingFile(join(cwd, "package.json"));
	if (packageJson) {
		const deps = parsePackageDependencies(packageJson, config.maxDependencies);
		if (deps.length > 0) {
			sections.push(
				format === "xml"
					? `<nodejs source="package.json">\n<dependencies>\n${deps.join("\n")}\n</dependencies>\n</nodejs>`
					: `### Node.js\n${deps.map((dep) => `- ${dep}`).join("\n")}`,
			);
		}
	}

	const requirements = await readExistingFile(join(cwd, "requirements.txt"));
	if (requirements) {
		const deps = parseRequirementsDependencies(requirements, config.maxDependencies);
		if (deps.length > 0) {
			sections.push(
				format === "xml"
					? `<python source="requirements.txt">\n<dependencies>\n${deps.join("\n")}\n</dependencies>\n</python>`
					: `### Python (requirements.txt)\n${deps.map((dep) => `- ${dep}`).join("\n")}`,
			);
		}
	}

	const pyproject = await readExistingFile(join(cwd, "pyproject.toml"));
	if (pyproject) {
		const deps = parsePyprojectDependencies(pyproject, config.maxDependencies);
		if (deps.length > 0) {
			sections.push(
				format === "xml"
					? `<python source="pyproject.toml">\n<dependencies>\n${deps.join("\n")}\n</dependencies>\n</python>`
					: `### Python (pyproject.toml)\n${deps.map((dep) => `- ${dep}`).join("\n")}`,
			);
		}
	}

	const goMod = await readExistingFile(join(cwd, "go.mod"));
	if (goMod) {
		const parsed = parseGoMod(goMod, config.maxDependencies);
		if (parsed) {
			sections.push(
				format === "xml"
					? `<go ${parsed.meta
						.split(", ")
						.map((entry) => {
							const [key, value] = entry.split("=");
							return `${key}="${escapeXmlAttribute(value ?? "")}"`;
						})
						.join(" ")}>\n${parsed.deps.length > 0 ? `<dependencies>\n${parsed.deps.join("\n")}\n</dependencies>` : ""}\n</go>`
					: `### Go (${parsed.meta})${parsed.deps.length > 0 ? `\n${parsed.deps.map((dep) => `- ${dep}`).join("\n")}` : ""}`,
			);
		}
	}

	const cargo = await readExistingFile(join(cwd, "Cargo.toml"));
	if (cargo) {
		const parsed = parseCargo(cargo, config.maxDependencies);
		if (parsed) {
			sections.push(
				format === "xml"
					? `<rust ${parsed.meta
						.split(", ")
						.map((entry) => {
							const [key, value] = entry.split("=");
							return `${key}="${escapeXmlAttribute(value ?? "")}"`;
						})
						.join(" ")}>\n${parsed.deps.length > 0 ? `<dependencies>\n${parsed.deps.join("\n")}\n</dependencies>` : ""}\n</rust>`
					: `### Rust (${parsed.meta})${parsed.deps.length > 0 ? `\n${parsed.deps.map((dep) => `- ${dep}`).join("\n")}` : ""}`,
			);
		}
	}

	if (sections.length === 0) {
		logger.debug("No tech stack files discovered for context injection.");
		return { name: "tech_stack", content: null };
	}

	return {
		name: "tech_stack",
		content: renderSection(format, "tech_stack", "Tech Stack", sections.join("\n")),
	};
}

async function getActiveFilesSection(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
): Promise<SourceResult> {
	const days = config.compaction.recentFilesMaxAge;
	const result = await runCommand(
		"git",
		["log", `--since=${days} days ago`, "--name-only", "--pretty=format:"],
		cwd,
	);
	if (!result.ok) {
		logger.debug("Skipping recent files context", { error: result.error, stderr: result.stderr });
		return { name: "recent_files", content: null };
	}

	const maxFiles = config.compaction.maxRecentFiles;
	const uniqueFiles = Array.from(
		new Set(
			result.stdout
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line.length > 0),
		),
	).slice(0, maxFiles);

	if (uniqueFiles.length === 0) {
		return { name: "recent_files", content: null };
	}

	const body = uniqueFiles.join("\n");
	const section = renderSection(format, "recent_files", "Recent Files", body, {
		days: String(days),
		count: String(uniqueFiles.length),
	});
	return { name: "recent_files", content: section };
}

function normalizeTodoText(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function extractTodoSnapshotFromBranch(branchEntries: unknown[]): TodoSnapshot | null {
	for (let i = branchEntries.length - 1; i >= 0; i -= 1) {
		const entry = branchEntries[i] as {
			type?: string;
			message?: {
				role?: string;
				toolName?: string;
				details?: {
					todos?: Array<{ text?: unknown; content?: unknown; done?: unknown; status?: unknown }>;
				};
			};
		};

		if (entry?.type !== "message") {
			continue;
		}
		if (entry.message?.role !== "toolResult" || entry.message?.toolName !== "todo") {
			continue;
		}

		const todos = entry.message.details?.todos;
		if (!Array.isArray(todos) || todos.length === 0) {
			continue;
		}

		const snapshot: TodoSnapshot = { pending: [], inProgress: [], completed: [] };
		for (const todo of todos) {
			const text = normalizeTodoText(todo.text) ?? normalizeTodoText(todo.content);
			if (!text) {
				continue;
			}

			if (todo.status === "in_progress") {
				snapshot.inProgress.push(text);
				continue;
			}
			if (todo.done === true || todo.status === "completed") {
				snapshot.completed.push(text);
				continue;
			}
			snapshot.pending.push(text);
		}

		if (snapshot.pending.length > 0 || snapshot.inProgress.length > 0 || snapshot.completed.length > 0) {
			return snapshot;
		}
	}

	return null;
}

function buildTodoSection(format: ContextFormat, snapshot: TodoSnapshot): SourceResult {
	if (format === "xml") {
		const parts: string[] = [];
		if (snapshot.inProgress.length > 0) {
			const inProgress = snapshot.inProgress.map(escapeXmlText).join("\n");
			parts.push(`<in_progress count="${snapshot.inProgress.length}">\n${inProgress}\n</in_progress>`);
		}
		if (snapshot.pending.length > 0) {
			const pending = snapshot.pending.map(escapeXmlText).join("\n");
			parts.push(`<pending count="${snapshot.pending.length}">\n${pending}\n</pending>`);
		}
		if (snapshot.completed.length > 0) {
			const recentCompleted = snapshot.completed.slice(-5);
			const completed = recentCompleted.map(escapeXmlText).join("\n");
			parts.push(
				`<completed count="${snapshot.completed.length}" showing="${recentCompleted.length}">\n${completed}\n</completed>`,
			);
		}

		if (parts.length === 0) {
			return { name: "todo_state", content: null };
		}

		return {
			name: "todo_state",
			content: renderSection(format, "task_state", "Task State", parts.join("\n")),
		};
	}

	const sections: string[] = [];
	if (snapshot.inProgress.length > 0) {
		sections.push(`### In Progress (${snapshot.inProgress.length})\n${snapshot.inProgress.map((item) => `- ${item}`).join("\n")}`);
	}
	if (snapshot.pending.length > 0) {
		sections.push(`### Pending (${snapshot.pending.length})\n${snapshot.pending.map((item) => `- ${item}`).join("\n")}`);
	}
	if (snapshot.completed.length > 0) {
		const shown = snapshot.completed.slice(-5);
		sections.push(`### Completed (${snapshot.completed.length})\n${shown.map((item) => `- ${item}`).join("\n")}`);
	}

	return {
		name: "todo_state",
		content: sections.length > 0 ? renderSection(format, "task_state", "Task State", sections.join("\n\n")) : null,
	};
}

function withAdditionalContext(format: ContextFormat, source: string[]): string[] {
	return source
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => (format === "xml" ? `<note>${escapeXmlText(line)}</note>` : `- ${line}`));
}

export function detectFormat(config: ContextInjectorConfig, model: ModelLike | undefined): ContextFormat {
	if (!config.dynamicFormat) {
		return "xml";
	}
	if (!model) {
		return "xml";
	}

	const provider = (model.provider ?? "").toLowerCase();
	const modelId = (model.id ?? "").toLowerCase();
	const api = (model.api ?? "").toLowerCase();
	const modelRef = `${provider}/${modelId}/${api}`;

	if (provider.includes("anthropic") || modelRef.includes("claude")) {
		return "xml";
	}

	const xmlPreferredFamilies = ["gpt-5", "gemini", "glm", "kimi", "minimax", "big-pickle"];
	if (xmlPreferredFamilies.some((family) => modelRef.includes(family))) {
		return "xml";
	}

	return "markdown";
}

export async function buildProjectContext(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
): Promise<BuildContextResult> {
	const [readme, techStack, workspace, git] = await Promise.all([
		getReadmeSection(cwd, format, config, logger),
		getTechStackSection(cwd, format, config, logger),
		getWorkspaceSection(cwd, format, config.enableWorkspaceState, logger),
		getGitSection(cwd, format, config, logger),
	]);

	const ordered = [readme, techStack, workspace, git].filter((section) => section.content !== null) as Array<
		SourceResult & { content: string }
	>;

	if (ordered.length === 0) {
		return { block: null, sectionNames: [], warnings: [] };
	}

	let block = finalizeBlock(
		format,
		"project_context",
		"project_context",
		ordered.map((section) => section.content),
	);
	block = applyBoldStripping(block, config.stripBold);

	return {
		block,
		sectionNames: ordered.map((section) => section.name),
		warnings: [],
	};
}

export async function buildCompactionContext(
	cwd: string,
	format: ContextFormat,
	config: ContextInjectorConfig,
	logger: ContextBuildLogger,
	todoSnapshot: TodoSnapshot | null,
): Promise<BuildContextResult> {
	const sections: SourceResult[] = [];

	if (config.compaction.injectWorkspaceState) {
		sections.push(await getWorkspaceSection(cwd, format, true, logger));
	}
	if (config.compaction.injectTechStack) {
		sections.push(await getTechStackSection(cwd, format, config, logger));
	}
	if (config.compaction.injectActiveFiles) {
		sections.push(await getActiveFilesSection(cwd, format, config, logger));
	}
	if (config.compaction.injectTodoState && todoSnapshot) {
		sections.push(buildTodoSection(format, todoSnapshot));
	}

	const additionalLines = withAdditionalContext(format, config.compaction.additionalContext);
	for (const line of additionalLines) {
		sections.push({ name: "additional_context", content: line });
	}

	const nonEmpty = sections.filter((section) => section.content !== null) as Array<SourceResult & { content: string }>;
	if (nonEmpty.length === 0) {
		return { block: null, sectionNames: [], warnings: [] };
	}

	let block = finalizeBlock(
		format,
		"compaction_context",
		"compaction_context",
		nonEmpty.map((section) => section.content),
	);
	block = applyBoldStripping(block, config.stripBold);

	return {
		block,
		sectionNames: nonEmpty.map((section) => section.name),
		warnings: [],
	};
}
