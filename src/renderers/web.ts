/**
 * Web renderer: a loopback-only form for clients that cannot elicit.
 *
 * Security: binds 127.0.0.1 on a random port, requires a one-time token in the
 * URL, sends strict headers, escapes every user-provided string, and closes
 * after submit, cancel, or timeout.
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { orderedSelection, type AskAnswer, type AskQuestion } from "../questions.ts";

const MAX_BODY = 1_000_000;

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function optionKey(questionIndex: number): string {
	return `q${questionIndex}_choice`;
}

function noteKey(questionIndex: number): string {
	return `q${questionIndex}_note`;
}

export function renderWebForm(questions: AskQuestion[], token: string, warnings: string[] = []): string {
	const sections = questions
		.map((q, i) => {
			const inputType = q.multiSelect ? "checkbox" : "radio";
			const options = q.options
				.map((option, j) => {
					const id = `q${i}_o${j}`;
					const recommended = option.recommended ? ' <span class="rec">(Recommended)</span>' : "";
					const description = option.description
						? `<div class="desc">${escapeHtml(option.description)}</div>`
						: "";
					return `<label class="option" for="${id}">
  <input id="${id}" type="${inputType}" name="${optionKey(i)}" value="${escapeHtml(option.label)}">
  <span class="label">${escapeHtml(option.label)}${recommended}</span>
  ${description}
</label>`;
				})
				.join("\n");
			return `<section>
  <h2>[Q${i + 1}] ${escapeHtml(q.question)}</h2>
  ${q.options.length > 0 ? options : '<p class="none">(No preset options — add a note below.)</p>'}
  <label class="note">
    <span>Note (optional)</span>
    <textarea name="${noteKey(i)}" rows="3" placeholder="Extra detail for this answer"></textarea>
  </label>
</section>`;
		})
		.join("\n");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AskUserMore</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.45 system-ui, sans-serif; max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.35rem; margin: 0 0 .25rem; }
  .sub { color: #888; margin: 0 0 1.5rem; }
  section { border: 1px solid #8884; border-radius: .6rem; padding: 1rem; margin: 1rem 0; }
  h2 { font-size: 1.05rem; margin: 0 0 .75rem; }
  .option { display: block; padding: .45rem .5rem; border-radius: .4rem; cursor: pointer; }
  .option:hover { background: #8881; }
  .option input { margin-right: .5rem; }
  .label { font-weight: 500; }
  .desc { color: #888; margin: .15rem 0 0 1.7rem; font-size: .92em; }
  .rec { color: #2e7d32; font-size: .9em; }
  .none { color: #888; }
  .warn { border: 1px solid #b26a00; background: #b26a0020; border-radius: .5rem; padding: .6rem .8rem; }
  .warn ul { margin: .3rem 0 0 1.1rem; padding: 0; }
  .note { display: block; margin-top: .75rem; }
  .note span { display: block; color: #888; font-size: .92em; margin-bottom: .25rem; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; padding: .5rem; border: 1px solid #8886; border-radius: .4rem; }
  .actions { display: flex; gap: .75rem; margin-top: 1.25rem; }
  button { font: inherit; padding: .6rem 1.1rem; border-radius: .45rem; border: 1px solid #8886; cursor: pointer; }
  button.primary { background: #2e7d32; color: white; border-color: #2e7d32; }
  button.secondary { background: transparent; }
</style>
</head>
<body>
<h1>AskUserMore</h1>
<p class="sub">${questions.length} question${questions.length === 1 ? "" : "s"} · answers go back to Claude.</p>
${warnings.length > 0 ? `<div class="warn"><strong>Warnings</strong><ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join("")}</ul></div>` : ""}
<form method="post" action="/submit?token=${encodeURIComponent(token)}">
${sections}
<div class="actions">
  <button class="primary" type="submit">Submit answers</button>
  <button class="secondary" type="submit" formaction="/cancel?token=${encodeURIComponent(token)}" formnovalidate>Cancel</button>
</div>
</form>
</body>
</html>`;
}

export function parseWebSubmission(questions: AskQuestion[], form: URLSearchParams): AskAnswer[] {
	return questions.map((q, i) => {
		const labels = q.options.map((option) => option.label);
		const single = form.get(optionKey(i));
		const multiple = form.getAll(optionKey(i)).filter((value): value is string => labels.includes(value));
		const selected = q.multiSelect
			? orderedSelection(multiple, q.options)
			: single && labels.includes(single)
				? [single]
				: [];
		const note = form.get(noteKey(i))?.trim() || undefined;
		return {
			header: q.header ?? `Q${i + 1}`,
			question: q.question,
			selected,
			note,
		};
	});
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = "";
		req.on("data", (chunk: Buffer) => {
			data += chunk.toString("utf8");
			if (data.length > MAX_BODY) {
				req.destroy();
				reject(new Error("request body too large"));
			}
		});
		req.on("end", () => resolve(data));
		req.on("error", reject);
	});
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
	res.writeHead(status, {
		"content-type": "text/html; charset=utf-8",
		"content-security-policy":
			"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		"x-content-type-options": "nosniff",
		"referrer-policy": "no-referrer",
		"cache-control": "no-store",
	});
	res.end(html);
}

function openBrowser(url: string): void {
	if (process.env.ASK_USER_MORE_NO_BROWSER === "1") {
		console.error(`ask-user-more web form: ${url}`);
		return;
	}
	const [command, args] =
		process.platform === "win32"
			? ["cmd", ["/c", "start", "", url]]
			: process.platform === "darwin"
				? ["open", [url]]
				: ["xdg-open", [url]];
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.on("error", () => console.error(`ask-user-more web form: open manually: ${url}`));
		child.unref();
	} catch {
		console.error(`ask-user-more web form: open manually: ${url}`);
	}
}

export interface WebOptions {
	timeoutMs?: number;
	warnings?: string[];
	/** Called with the form URL (tests/logging). */
	onUrl?: (url: string) => void;
}

/** Resolves with the answers, or undefined if cancelled/timed out. */
export function askViaWeb(questions: AskQuestion[], options: WebOptions = {}): Promise<AskAnswer[] | undefined> {
	const token = randomBytes(24).toString("hex");
	const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

	return new Promise((resolve, reject) => {
		let settled = false;
		let timer: NodeJS.Timeout | undefined;

		const finish = (value: AskAnswer[] | undefined) => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			server.closeAllConnections?.();
			server.close(() => resolve(value));
		};

		const server = createServer((req, res) => {
			void (async () => {
				try {
					const url = new URL(req.url ?? "/", "http://127.0.0.1");
					if (url.searchParams.get("token") !== token) {
						sendHtml(res, 401, "<h1>Invalid or expired link</h1>");
						return;
					}

					if (req.method === "GET" && url.pathname === "/") {
						sendHtml(res, 200, renderWebForm(questions, token, options.warnings ?? []));
						return;
					}

					if (req.method === "POST" && url.pathname === "/cancel") {
						sendHtml(res, 200, "<h1>Cancelled</h1><p>You can close this tab.</p>");
						res.on("finish", () => finish(undefined));
						return;
					}

					if (req.method === "POST" && url.pathname === "/submit") {
						const body = await readBody(req);
						const answers = parseWebSubmission(questions, new URLSearchParams(body));
						sendHtml(res, 200, "<h1>Submitted</h1><p>You can close this tab and return to Claude.</p>");
						res.on("finish", () => finish(answers));
						return;
					}

					sendHtml(res, 404, "<h1>Not found</h1>");
				} catch (error) {
					sendHtml(res, 500, "<h1>Something went wrong</h1>");
					reject(error);
				}
			})();
		});

		server.on("error", (error) => {
			if (!settled) {
				settled = true;
				if (timer) clearTimeout(timer);
				reject(error);
			}
		});

		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			const port = typeof address === "object" && address ? address.port : 0;
			const url = `http://127.0.0.1:${port}/?token=${token}`;
			options.onUrl?.(url);
			openBrowser(url);
		});

		timer = setTimeout(() => finish(undefined), timeoutMs);
		timer.unref?.();
	});
}
