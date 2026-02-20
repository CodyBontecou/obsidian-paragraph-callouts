import {
	App,
	MarkdownPostProcessorContext,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import {
	Decoration,
	DecorationSet,
	EditorView,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";

// ── Types ────────────────────────────────────────────

interface CalloutMapping {
	prefix: string;   // single character, e.g. "!"
	emoji: string;    // emoji character, e.g. "🚨"
	label: string;    // human-readable label, e.g. "Alert"
	bgColor: string;  // CSS background-color
	borderColor: string; // CSS border-left color
}

interface ParagraphCalloutsSettings {
	mappings: CalloutMapping[];
}

// ── Defaults ─────────────────────────────────────────

const DEFAULT_MAPPINGS: CalloutMapping[] = [
	{
		prefix: "!",
		emoji: "🚨",
		label: "Alert",
		bgColor: "rgba(255,0,0,0.08)",
		borderColor: "#e74c3c",
	},
	{
		prefix: "?",
		emoji: "❓",
		label: "Question",
		bgColor: "rgba(255,200,0,0.08)",
		borderColor: "#f39c12",
	},
	{
		prefix: "~",
		emoji: "💡",
		label: "Idea",
		bgColor: "rgba(0,200,100,0.08)",
		borderColor: "#2ecc71",
	},
	{
		prefix: ";",
		emoji: "📝",
		label: "Note",
		bgColor: "rgba(0,100,255,0.08)",
		borderColor: "#3498db",
	},
];

const DEFAULT_SETTINGS: ParagraphCalloutsSettings = {
	mappings: [...DEFAULT_MAPPINGS],
};

// ── Emoji Widget (CM6) ──────────────────────────────

class EmojiWidget extends WidgetType {
	constructor(private emoji: string) {
		super();
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "paragraph-callout-emoji";
		span.textContent = this.emoji;
		return span;
	}

	eq(other: EmojiWidget): boolean {
		return this.emoji === other.emoji;
	}
}

// ── Helpers ──────────────────────────────────────────

function cssClassForLabel(label: string): string {
	return "paragraph-callout-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

/** Inject a dynamic <style> element so user-configured colours work. */
function buildDynamicCSS(mappings: CalloutMapping[]): string {
	return mappings
		.map((m) => {
			const cls = cssClassForLabel(m.label);
			return `.${cls}{background-color:${m.bgColor};border-left:3px solid ${m.borderColor};}`;
		})
		.join("\n");
}

/** Check whether a given document position sits inside a code block. */
function isInsideCodeBlock(view: EditorView, pos: number): boolean {
	let inCode = false;
	syntaxTree(view.state).iterate({
		from: 0,
		to: pos + 1,
		enter(node: { type: { name: string }; from: number; to: number }) {
			const name = node.type.name;
			if (
				name.includes("codeblock") ||
				name.includes("CodeBlock") ||
				name === "FencedCode" ||
				name.includes("HyperMD-codeblock")
			) {
				if (node.from <= pos && node.to >= pos) {
					inCode = true;
				}
			}
		},
	});
	return inCode;
}

// ── CM6 ViewPlugin builder ──────────────────────────

function buildViewPlugin(mappings: CalloutMapping[]) {
	const prefixMap = new Map<string, CalloutMapping>();
	for (const m of mappings) {
		prefixMap.set(m.prefix, m);
	}

	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = this.buildDecorations(view);
			}

			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged || update.selectionSet) {
					this.decorations = this.buildDecorations(update.view);
				}
			}

			buildDecorations(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();

				for (const { from, to } of view.visibleRanges) {
					for (let pos = from; pos <= to; ) {
						const line = view.state.doc.lineAt(pos);
						const text = line.text;

						if (text.length >= 2 && prefixMap.has(text[0]) && text[1] === " ") {
							const mapping = prefixMap.get(text[0])!;

							// Skip lines inside code blocks
							if (!isInsideCodeBlock(view, line.from)) {
								const cls = cssClassForLabel(mapping.label);

								// Line decoration for background + border
								builder.add(
									line.from,
									line.from,
									Decoration.line({ class: `paragraph-callout ${cls}` })
								);

								// Check if cursor is on this line – if so, don't replace prefix
								const cursorLine = view.state.doc.lineAt(
									view.state.selection.main.head
								);
								if (cursorLine.number !== line.number) {
									// Replace prefix char with emoji widget
									builder.add(
										line.from,
										line.from + 2, // prefix char + space
										Decoration.replace({
											widget: new EmojiWidget(mapping.emoji),
										})
									);
								}
							}
						}

						pos = line.to + 1;
					}
				}

				return builder.finish();
			}
		},
		{ decorations: (v) => v.decorations }
	);
}

// ── Plugin ───────────────────────────────────────────

export default class ParagraphCalloutsPlugin extends Plugin {
	settings: ParagraphCalloutsSettings = DEFAULT_SETTINGS;
	private styleEl: HTMLStyleElement | null = null;
	private editorExtension: ReturnType<typeof buildViewPlugin>[] = [];

	async onload() {
		await this.loadSettings();

		// Inject dynamic CSS
		this.injectStyles();

		// Register CM6 extension for live preview
		this.refreshEditorExtension();

		// Reading mode post-processor
		this.registerMarkdownPostProcessor(
			(el: HTMLElement, _ctx: MarkdownPostProcessorContext) => {
				this.processReadingMode(el);
			}
		);

		// Settings tab
		this.addSettingTab(new ParagraphCalloutsSettingTab(this.app, this));
	}

	onunload() {
		if (this.styleEl) {
			this.styleEl.remove();
			this.styleEl = null;
		}
	}

	// ── Reading mode processor ───────────────────────

	private processReadingMode(el: HTMLElement) {
		const paragraphs = el.querySelectorAll("p");
		for (const p of Array.from(paragraphs)) {
			const text = p.textContent ?? "";
			for (const m of this.settings.mappings) {
				if (text.startsWith(m.prefix + " ")) {
					const cls = cssClassForLabel(m.label);
					p.classList.add("paragraph-callout", cls);

					// Replace the first text node's prefix with emoji
					const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
					const firstText = walker.nextNode();
					if (firstText && firstText.textContent) {
						const emojiSpan = document.createElement("span");
						emojiSpan.className = "paragraph-callout-emoji";
						emojiSpan.textContent = m.emoji;

						// Remove "X " from beginning of text node
						firstText.textContent = firstText.textContent.slice(2);
						p.insertBefore(emojiSpan, p.firstChild);
					}
					break; // only match first mapping
				}
			}
		}
	}

	// ── Dynamic styles ───────────────────────────────

	injectStyles() {
		if (this.styleEl) {
			this.styleEl.remove();
		}
		this.styleEl = document.createElement("style");
		this.styleEl.id = "paragraph-callouts-dynamic";
		this.styleEl.textContent = buildDynamicCSS(this.settings.mappings);
		document.head.appendChild(this.styleEl);
	}

	// ── Editor extension management ──────────────────

	refreshEditorExtension() {
		this.editorExtension = [buildViewPlugin(this.settings.mappings)];
		this.registerEditorExtension(this.editorExtension);
	}

	// ── Settings persistence ─────────────────────────

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		// Ensure mappings array exists
		if (!Array.isArray(this.settings.mappings)) {
			this.settings.mappings = [...DEFAULT_MAPPINGS];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.injectStyles();
	}
}

// ── Settings Tab ─────────────────────────────────────

class ParagraphCalloutsSettingTab extends PluginSettingTab {
	plugin: ParagraphCalloutsPlugin;

	constructor(app: App, plugin: ParagraphCalloutsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Paragraph Callouts" });
		containerEl.createEl("p", {
			text: "Configure prefix characters and their callout styles. Each prefix character at the start of a paragraph (followed by a space) will render as a styled callout.",
		});

		// Render each mapping
		this.plugin.settings.mappings.forEach((mapping, index) => {
			const section = containerEl.createDiv({ cls: "paragraph-callout-setting-group" });
			section.style.border = "1px solid var(--background-modifier-border)";
			section.style.borderRadius = "8px";
			section.style.padding = "12px";
			section.style.marginBottom = "12px";

			// Header with delete button
			new Setting(section)
				.setName(`Mapping #${index + 1}`)
				.setDesc(`Preview: ${mapping.emoji} ${mapping.label}`)
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.mappings.splice(index, 1);
							await this.plugin.saveSettings();
							this.display();
						})
				);

			new Setting(section)
				.setName("Prefix character")
				.addText((text) =>
					text
						.setPlaceholder("!")
						.setValue(mapping.prefix)
						.onChange(async (value) => {
							// Only allow single character
							this.plugin.settings.mappings[index].prefix = value.slice(0, 1);
							await this.plugin.saveSettings();
						})
				);

			new Setting(section)
				.setName("Emoji")
				.addText((text) =>
					text
						.setPlaceholder("🚨")
						.setValue(mapping.emoji)
						.onChange(async (value) => {
							this.plugin.settings.mappings[index].emoji = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(section)
				.setName("Label")
				.addText((text) =>
					text
						.setPlaceholder("Alert")
						.setValue(mapping.label)
						.onChange(async (value) => {
							this.plugin.settings.mappings[index].label = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(section)
				.setName("Background color")
				.addText((text) =>
					text
						.setPlaceholder("rgba(255,0,0,0.08)")
						.setValue(mapping.bgColor)
						.onChange(async (value) => {
							this.plugin.settings.mappings[index].bgColor = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(section)
				.setName("Border color")
				.addText((text) =>
					text
						.setPlaceholder("#e74c3c")
						.setValue(mapping.borderColor)
						.onChange(async (value) => {
							this.plugin.settings.mappings[index].borderColor = value;
							await this.plugin.saveSettings();
						})
				);
		});

		// Add new mapping button
		new Setting(containerEl)
			.setName("Add new mapping")
			.setDesc("Add a new prefix → callout mapping")
			.addButton((btn) =>
				btn.setButtonText("+ Add mapping").setCta().onClick(async () => {
					this.plugin.settings.mappings.push({
						prefix: "",
						emoji: "",
						label: "Custom",
						bgColor: "rgba(128,128,128,0.08)",
						borderColor: "#888888",
					});
					await this.plugin.saveSettings();
					this.display();
				})
			);

		// Reset to defaults
		new Setting(containerEl)
			.setName("Reset to defaults")
			.setDesc("Restore the default prefix mappings")
			.addButton((btn) =>
				btn
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						this.plugin.settings.mappings = [...DEFAULT_MAPPINGS];
						await this.plugin.saveSettings();
						this.display();
					})
			);
	}
}
