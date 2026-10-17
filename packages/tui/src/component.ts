/**
 * The AskUserMore questionnaire component, extracted from the pi extension so
 * the pi TUI and the standalone terminal renderer share one implementation.
 */

import {
	Editor,
	type EditorTheme,
	Key,
	matchesKey,
	sliceByColumn,
	type Component,
	type TUI,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

import {
	allAnswered,
	type AnswerDraft,
	type AskAnswer,
	type AskOption,
	type AskQuestion,
	buildAnswers,
	clearNote,
	draftOf,
	makePaint,
	noteSnippet,
	renderAnswers,
	setNote,
	setSingle,
	toggleMulti,
	questionWarning,
	type Metrics,
	type WarnConfig,
} from "@ask-user-more/core";

export interface QuestionnaireResult {
	answers: AskAnswer[];
	cancelled: boolean;
	questions: AskQuestion[];
}

export interface QuestionnaireTheme {
	fg(color: string, text: string): string;
	bg(color: string, text: string): string;
	bold(text: string): string;
}

type RenderOption = AskOption & { isNote?: boolean };

const NOTE_SNIPPET_MAX = 48;
const MAX_VIEWPORT = 20;
const metrics: Metrics = { width: visibleWidth, slice: sliceByColumn };

export function createQuestionnaireComponent(
	tui: TUI,
	theme: QuestionnaireTheme,
	questions: AskQuestion[],
	config: WarnConfig,
	done: (result: QuestionnaireResult) => void,
): Component {
				let drafts = new Map<number, AnswerDraft>();
				let tab = 0;
				let idx = 0;
				let editingNote = false;
				let noteFor = 0;
				let scrollTop = 0;
				let cached: string[] | undefined;
				let viewport = 10;
				let bodyLength = 0;

				const submitTab = questions.length;
				const totalTabs = questions.length + 1;

				const editorTheme: EditorTheme = {
					borderColor: (s) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				const refresh = () => {
					cached = undefined;
					tui.requestRender();
				};

				const noteIndexFor = (qi: number) => questions[qi].options.length;
				const isSelected = (qi: number, label: string) => draftOf(drafts, qi).selected.includes(label);
				const answered = (qi: number) => {
					const draft = draftOf(drafts, qi);
					return draft.selected.length > 0 || !!draft.note?.trim();
				};

				const finish = (cancelled: boolean) => {
					done({ answers: buildAnswers(questions, drafts), cancelled, questions });
				};

				const optionsFor = (qi: number): RenderOption[] => [
					...questions[qi].options,
					{
						label: "Note...",
						description: "add a note (saved in place; Delete clears)",
						isNote: true,
					},
				];

				const editNote = (qi: number) => {
					editingNote = true;
					noteFor = qi;
					editor.setText(draftOf(drafts, qi).note ?? "");
					idx = noteIndexFor(qi);
					refresh();
				};

				const commitNote = (value: string) => {
					drafts = setNote(drafts, noteFor, value);
					editor.setText("");
				};

				editor.onSubmit = (value) => {
					editingNote = false;
					commitNote(value);
					idx = noteIndexFor(noteFor);
					refresh();
				};

				function handleInput(data: string) {
					if (editingNote) {
						if (matchesKey(data, Key.escape)) {
							editingNote = false;
							editor.setText("");
							refresh();
							return;
						}
						// Ctrl+S saves the draft and submits, so a note being typed is never lost.
						if (matchesKey(data, Key.ctrl("s"))) {
							commitNote(editor.getText());
							editingNote = false;
							finish(false);
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					if (matchesKey(data, Key.ctrl("s"))) {
						finish(false);
						return;
					}
					if (matchesKey(data, Key.escape)) {
						finish(true);
						return;
					}

					// Scrolling: the tab bar and hint stay fixed; only the body moves.
					const page = Math.max(1, viewport - 2);
					const maxScroll = Math.max(0, bodyLength - viewport);
					if (matchesKey(data, Key.pageUp)) {
						scrollTop = Math.max(0, scrollTop - page);
						refresh();
						return;
					}
					if (matchesKey(data, Key.pageDown)) {
						scrollTop = Math.min(maxScroll, scrollTop + page);
						refresh();
						return;
					}
					if (matchesKey(data, Key.home)) {
						scrollTop = 0;
						refresh();
						return;
					}
					if (matchesKey(data, Key.end)) {
						scrollTop = maxScroll;
						refresh();
						return;
					}

					if (totalTabs > 1) {
						// Tab / Shift+Tab wrap through questions and Submit; ← / → stop at the ends.
						if (matchesKey(data, Key.tab)) {
							tab = (tab + 1) % totalTabs;
							idx = 0;
							scrollTop = 0;
							refresh();
							return;
						}
						if (matchesKey(data, Key.shift("tab"))) {
							tab = (tab - 1 + totalTabs) % totalTabs;
							idx = 0;
							scrollTop = 0;
							refresh();
							return;
						}
						if (matchesKey(data, Key.right)) {
							if (tab < totalTabs - 1) {
								tab++;
								idx = 0;
								scrollTop = 0;
								refresh();
							}
							return;
						}
						if (matchesKey(data, Key.left)) {
							if (tab > 0) {
								tab--;
								idx = 0;
								scrollTop = 0;
								refresh();
							}
							return;
						}
					}

					if (tab === submitTab) {
						// Blank answers are valid, so the summary never blocks submitting.
						if (matchesKey(data, Key.enter)) finish(false);
						return;
					}

					const options = optionsFor(tab);
					if (matchesKey(data, Key.up)) {
						idx = Math.max(0, idx - 1);
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						idx = Math.min(options.length - 1, idx + 1);
						refresh();
						return;
					}

					const option = options[idx];
					if (!option) return;

					if (matchesKey(data, Key.delete)) {
						if (option.isNote && draftOf(drafts, tab).note) {
							drafts = clearNote(drafts, tab);
							refresh();
						}
						return;
					}

					if (matchesKey(data, Key.enter)) {
						if (option.isNote) {
							editNote(tab);
							return;
						}
						if (questions[tab].multiSelect) {
							drafts = toggleMulti(drafts, tab, option.label);
							refresh();
							return;
						}
						drafts = setSingle(drafts, tab, option.label);
						refresh();
					}
				}

				function pushWrapped(out: string[], prefix: string, text: string, width: number) {
					const prefixWidth = visibleWidth(prefix);
					if (prefixWidth >= width) {
						out.push(...wrapTextWithAnsi(prefix + text, width));
						return;
					}
					const wrapped = wrapTextWithAnsi(text, width - prefixWidth);
					const pad = " ".repeat(prefixWidth);
					wrapped.forEach((line, i) => out.push(`${i === 0 ? prefix : pad}${line}`));
				}

				function renderTabBar(width: number): string[] {
					if (totalTabs <= 1) return [];
					const out: string[] = [];
					const parts: string[] = [];
					questions.forEach((q, i) => {
						const active = i === tab;
						const text = ` ${answered(i) ? "■" : "□"} ${q.header} `;
						parts.push(active ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg("muted", text));
					});
					const onSubmit = tab === submitTab;
					const submit = " ✓ Submit ";
					parts.push(
						onSubmit
							? theme.bg("selectedBg", theme.fg("text", submit))
							: theme.fg(allAnswered(drafts, questions.length) ? "success" : "dim", submit),
					);
					pushWrapped(out, " ", parts.join(" "), width);
					const questionWarningText = questionWarning(questions.length, config);
					if (questionWarningText) {
						pushWrapped(out, " ", theme.fg("warning", questionWarningText), width);
					}
					return out;
				}

				function renderBody(width: number): { lines: string[]; anchor?: number } {
					const out: string[] = [];

					if (tab === submitTab) {
						const paint = makePaint(theme);
						const rows = renderAnswers(
							buildAnswers(questions, drafts),
							questions,
							paint,
							Math.max(1, width - 1),
							metrics,
						);
						for (const row of rows) pushWrapped(out, " ", row, width);
						out.push("");
						if (allAnswered(drafts, questions.length)) {
							pushWrapped(out, " ", theme.fg("success", "Press Enter or Ctrl+S to submit"), width);
						} else {
							const blanks = questions
								.map((q, i) => (answered(i) ? null : q.header))
								.filter(Boolean)
								.join(", ");
							pushWrapped(
								out,
								" ",
								theme.fg("warning", `Left blank: ${blanks} — submit anyway with Enter`),
								width,
							);
						}
						return { lines: out };
					}

					const q = questions[tab];
					const draft = draftOf(drafts, tab);
					pushWrapped(out, " ", theme.fg("accent", theme.bold(q.header ?? `Q${tab + 1}`)), width);
					pushWrapped(out, " ", theme.fg("text", q.question), width);
					if (config.warnOptionsAt > 0 && q.options.length >= config.warnOptionsAt) {
						pushWrapped(
							out,
							" ",
							theme.fg(
								"warning",
								`${q.options.length} options (warn at ${config.warnOptionsAt}) — consider grouping.`,
							),
							width,
						);
					}
					out.push("");

					const options = optionsFor(tab);
					let anchor: number | undefined;
					options.forEach((option, i) => {
						if (i === idx) anchor = out.length;
						const focused = i === idx;
						const noteSet = option.isNote && !!draft.note;
						const locked = option.isNote ? noteSet : isSelected(tab, option.label);

						const pointer = focused ? theme.fg("accent", "> ") : "  ";
						const indexToken = option.isNote
							? theme.fg(locked ? "warning" : "muted", locked ? "[x] " : "[ ] ")
							: locked
								? theme.fg("success", `[${i + 1}]`)
								: theme.fg("text", `${i + 1}.`);
						const mark = option.isNote || !q.multiSelect ? "" : locked ? "[x] " : "[ ] ";
						const note = draft.note;
						const shown = option.isNote && note ? `Note: ${noteSnippet(note, NOTE_SNIPPET_MAX, metrics)}` : option.label;
						const body = theme.fg(focused ? "accent" : "text", `${mark}${shown}`);
						const recommended = option.recommended ? theme.fg("success", " (Recommended)") : "";
						pushWrapped(
							out,
							pointer,
							`${indexToken}${option.isNote ? "" : " "}${body}${recommended}`,
							width,
						);
						if (option.description && !(option.isNote && note)) {
							pushWrapped(out, "     ", theme.fg("muted", option.description), width);
						}
					});

					if (editingNote) {
						out.push("");
						pushWrapped(out, " ", theme.fg("muted", "Your answer:"), width);
						for (const line of editor.render(Math.max(1, width - 2))) out.push(` ${line}`);
						anchor = out.length - 1;
					}

					return { lines: out, anchor };
				}

				function renderHint(): string {
					if (editingNote) return "Enter save • Ctrl+S save + submit • Esc back • PgUp/PgDn scroll";
					if (tab === submitTab) return "Enter or Ctrl+S submit • Tab/←→ switch • Esc cancel • PgUp/PgDn scroll";
					if (questions[tab].multiSelect) {
						return "↑↓ select • Enter toggles • Del clears note • Tab/←→ switch • Ctrl+S submit • Esc cancel • PgUp/PgDn scroll";
					}
					return "↑↓ select • Enter picks/clears • Del clears note • Tab/←→ switch • Ctrl+S submit • Esc cancel • PgUp/PgDn scroll";
				}

				function render(width: number): string[] {
					if (cached) return cached;
					const renderWidth = Math.max(1, width);
					const tabLines = renderTabBar(renderWidth);
					const hintLines: string[] = [];
					pushWrapped(hintLines, " ", theme.fg("dim", renderHint()), renderWidth);
					// top rule + tab bar + blank + blank + hint + bottom rule
					const fixed = tabLines.length + hintLines.length + 4;
					const rows = tui.terminal?.rows ?? 24;
					viewport = Math.max(3, Math.min(MAX_VIEWPORT, rows - fixed));

					const body = renderBody(renderWidth);
					bodyLength = body.lines.length;
					const maxScroll = Math.max(0, bodyLength - viewport);
					scrollTop = Math.min(scrollTop, maxScroll);
					if (body.anchor !== undefined) {
						if (body.anchor < scrollTop + 1) scrollTop = Math.max(0, body.anchor - 1);
						else if (body.anchor >= scrollTop + viewport) {
							scrollTop = Math.min(maxScroll, body.anchor - viewport + 1);
						}
					}

					const visible = body.lines.slice(scrollTop, scrollTop + viewport);
					const lines = [
						theme.fg("accent", "─".repeat(renderWidth)),
						...tabLines,
						"",
						...visible,
						"",
						...hintLines,
						theme.fg("accent", "─".repeat(renderWidth)),
					];
					cached = lines;
					return lines;
				}

				return {
					render,
					invalidate: () => {
						cached = undefined;
					},
					handleInput,
				};
}
