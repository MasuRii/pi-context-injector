import { existsSync, mkdirSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { DEBUG_DIR, DEBUG_LOG_PATH } from "./constants.js";

const SECRET_KEY_PATTERN = /api[_-]?key|authorization|bearer|credential|password|secret|token/i;
const SECRET_VALUE_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{12,})\b/g;

function redactLogValue(value: unknown, key = ""): unknown {
	if (SECRET_KEY_PATTERN.test(key)) {
		return "[REDACTED]";
	}
	if (typeof value === "string") {
		return value.replace(SECRET_VALUE_PATTERN, "[REDACTED]");
	}
	if (Array.isArray(value)) {
		return value.map((entry) => redactLogValue(entry));
	}
	if (value && typeof value === "object") {
		const output: Record<string, unknown> = {};
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			output[nestedKey] = redactLogValue(nestedValue, nestedKey);
		}
		return output;
	}
	return value;
}

function formatDetails(details: unknown): string {
	if (details === undefined || details === null) {
		return "";
	}
	try {
		return `\n${JSON.stringify(redactLogValue(details), null, 2)}`;
	} catch {
		return `\n${String(redactLogValue(String(details)))}`;
	}
}

export class ContextInjectorLogger {
	private readonly isEnabled: () => boolean;
	private debugDirEnsured = false;

	constructor(isEnabled: () => boolean) {
		this.isEnabled = isEnabled;
	}

	debug(message: string, details?: unknown): void {
		if (!this.isEnabled()) {
			return;
		}

		this.write("DEBUG", message, details);
	}

	warn(message: string, details?: unknown): void {
		if (!this.isEnabled()) {
			return;
		}
		this.write("WARN", message, details);
	}

	private ensureDebugDirectory(): void {
		if (this.debugDirEnsured) {
			return;
		}
		if (!existsSync(DEBUG_DIR)) {
			mkdirSync(DEBUG_DIR, { recursive: true });
		}
		this.debugDirEnsured = true;
	}

	private write(level: string, message: string, details?: unknown): void {
		try {
			this.ensureDebugDirectory();
			const timestamp = new Date().toISOString();
			const line = `[${timestamp}] [${level}] ${message}${formatDetails(details)}\n`;
			void appendFile(DEBUG_LOG_PATH, line, "utf-8").catch(() => undefined);
		} catch {
			// Debug logging must never affect context injection or TUI responsiveness.
		}
	}
}
