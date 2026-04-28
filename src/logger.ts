import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { DEBUG_DIR, DEBUG_LOG_PATH } from "./constants.js";

function formatDetails(details: unknown): string {
	if (details === undefined || details === null) {
		return "";
	}
	try {
		return `\n${JSON.stringify(details, null, 2)}`;
	} catch {
		return `\n${String(details)}`;
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
			appendFileSync(DEBUG_LOG_PATH, line, "utf-8");
		} catch {
			// Debug logging must never affect context injection or TUI responsiveness.
		}
	}
}
