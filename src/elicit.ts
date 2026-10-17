/**
 * Map AskUserMore questions onto an MCP elicitation form.
 *
 * Claude Code renders the requestedSchema natively:
 *   - single-select -> string with oneOf (titles carry the option descriptions)
 *   - multi-select  -> array of enum values (or one boolean per option)
 *   - note          -> string field
 *
 * Everything is optional, so blank answers are allowed.
 */

import type { ElicitRequestFormParams } from "@modelcontextprotocol/sdk/types.js";

import { orderedSelection, type AskAnswer, type AskOption, type AskQuestion } from "./questions.ts";

type RequestedSchema = ElicitRequestFormParams["requestedSchema"];
export type MultiStyle = "array" | "booleans";

export interface BuiltForm {
	message: string;
	requestedSchema: RequestedSchema;
	parse(content: Record<string, unknown>): AskAnswer[];
}

type Field =
	| { kind: "choice"; question: number; key: string }
	| { kind: "choices"; question: number; key: string }
	| { kind: "boolean"; question: number; key: string; label: string }
	| { kind: "note"; question: number; key: string };

function optionTitle(option: AskOption): string {
	return option.description ? `${option.label} — ${option.description}` : option.label;
}

function isLabel(labels: string[], value: unknown): value is string {
	return typeof value === "string" && labels.includes(value);
}

export function buildForm(
	questions: AskQuestion[],
	style: MultiStyle,
	warnings: string[] = [],
): BuiltForm {
	const properties: Record<string, unknown> = {};
	const fields: Field[] = [];

	questions.forEach((q, index) => {
		const labels = q.options.map((option) => option.label);

		if (!q.multiSelect && q.options.length > 0) {
			const key = `q${index}_choice`;
			properties[key] = {
				type: "string",
				title: q.header,
				description: q.question,
				oneOf: q.options.map((option) => ({ const: option.label, title: optionTitle(option) })),
			};
			fields.push({ kind: "choice", question: index, key });
		}

		if (q.multiSelect && q.options.length > 0) {
			if (style === "booleans") {
				q.options.forEach((option, optionIndex) => {
					const key = `q${index}_opt_${optionIndex}`;
					properties[key] = {
						type: "boolean",
						title: optionTitle(option),
						description: q.question,
					};
					fields.push({ kind: "boolean", question: index, key, label: option.label });
				});
			} else {
				const key = `q${index}_choices`;
				properties[key] = {
					type: "array",
					title: q.header,
					description: q.question,
					minItems: 0,
					items: {
						anyOf: q.options.map((option) => ({ const: option.label, title: optionTitle(option) })),
					},
				};
				fields.push({ kind: "choices", question: index, key });
			}
		}

		const noteKey = `q${index}_note`;
		properties[noteKey] = {
			type: "string",
			title: `${q.header} — note`,
			description: "Optional note for this answer.",
		};
		fields.push({ kind: "note", question: index, key: noteKey });
	});

	const lines = [
		questions.length === 1
			? questions[0].question
			: `Answer ${questions.length} questions.`,
	];
	if (warnings.length > 0) lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));

	return {
		message: lines.join("\n"),
		requestedSchema: {
			type: "object",
			properties,
			required: [],
		} as unknown as RequestedSchema,
		parse(content) {
			const selected = questions.map(() => [] as string[]);
			const notes = new Map<number, string>();

			for (const field of fields) {
				const value = content[field.key];
				const labels = questions[field.question].options.map((option) => option.label);
				switch (field.kind) {
					case "choice":
						if (isLabel(labels, value)) selected[field.question] = [value];
						break;
					case "choices":
						if (Array.isArray(value)) {
							selected[field.question] = value.filter((item): item is string => isLabel(labels, item));
						}
						break;
					case "boolean":
						if (value === true) selected[field.question].push(field.label);
						break;
					case "note":
						if (typeof value === "string" && value.trim()) notes.set(field.question, value.trim());
						break;
				}
			}

			return questions.map((q, index) => ({
				header: q.header ?? `Q${index + 1}`,
				question: q.question,
				selected: orderedSelection(selected[index], q.options),
				note: notes.get(index),
			}));
		},
	};
}
