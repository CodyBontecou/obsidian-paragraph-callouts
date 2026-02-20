# Paragraph Callouts

An Obsidian plugin that turns simple prefix characters at the start of a paragraph into styled callout blocks.

## Usage

Start any paragraph with one of the default prefix characters followed by a space:

| Prefix | Emoji | Label    | Color  |
|--------|-------|----------|--------|
| `!`    | 🚨    | Alert    | Red    |
| `?`    | ❓    | Question | Yellow |
| `~`    | 💡    | Idea     | Green  |
| `;`    | 📝    | Note     | Blue   |

### Example

```
! This is an alert callout
? This is a question callout
~ This is an idea callout
; This is a note callout
```

## Settings

All prefix mappings are fully configurable. You can:

- Change the prefix character, emoji, label, background color, and border color for each mapping
- Add new custom mappings
- Remove existing mappings

## Installation

### From Community Plugins

1. Open **Settings → Community Plugins → Browse**
2. Search for "Paragraph Callouts"
3. Click **Install**, then **Enable**

### Manual Installation

1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/obsidian-paragraph-callouts/` directory.
2. Enable the plugin in Obsidian's Community Plugins settings.

## Author

Cody Bontecou
