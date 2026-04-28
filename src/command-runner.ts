import { execFile } from "node:child_process";

export interface CommandResult {
	ok: boolean;
	stdout: string;
	stderr: string;
	error?: string;
}

export async function runCommand(
	command: string,
	args: string[],
	cwd: string,
	timeoutMs = 4000,
): Promise<CommandResult> {
	return new Promise((resolve) => {
		execFile(
			command,
			args,
			{
				cwd,
				encoding: "utf-8",
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
				windowsHide: true,
			},
			(error, stdout, stderr) => {
				if (error) {
					resolve({
						ok: false,
						stdout: stdout ?? "",
						stderr: stderr ?? "",
						error: error.message,
					});
					return;
				}

				resolve({ ok: true, stdout: stdout ?? "", stderr: stderr ?? "" });
			},
		);
	});
}
