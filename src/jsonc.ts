export function parseJsonc(content: string): unknown {
	const lines = content.split("\n");
	const strippedLines = lines.map((line) => {
		let inString = false;
		let escapeNext = false;

		for (let i = 0; i < line.length; i += 1) {
			const char = line[i];
			if (escapeNext) {
				escapeNext = false;
				continue;
			}
			if (char === "\\") {
				escapeNext = true;
				continue;
			}
			if (char === '"') {
				inString = !inString;
				continue;
			}
			if (!inString && char === "/" && line[i + 1] === "/") {
				return line.slice(0, i);
			}
		}

		return line;
	});

	const stripped = strippedLines.join("\n");
	const noMultiline = stripped.replace(/\/\*[\s\S]*?\*\//g, "");
	const noTrailingCommas = noMultiline.replace(/,(\s*[}\]])/g, "$1");
	return JSON.parse(noTrailingCommas);
}
