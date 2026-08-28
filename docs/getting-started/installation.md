# Installation

## From the Obsidian Plugin Manager

Install through the Obsidian plugin manager: [https://obsidian.md/plugins?id=project-planner](https://obsidian.md/plugins?id=project-planner)

## Manual Installation (from a Release)

If you want to install a specific version or cannot use the plugin manager:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest GitHub Release](https://github.com/HMIL1151/project-planner/releases).
2. Create the plugin folder in your vault if it does not already exist: `<your-vault>/.obsidian/plugins/project-planner/`
3. Copy the three files into that folder.
4. Open Obsidian **Settings → Community plugins** and enable **Project Planner**.

## Build from Source

If you want to build the plugin yourself from the repository source:

Clone the repository and install dependencies:

```sh
git clone https://github.com/HMIL1151/project-planner.git
cd project-planner
npm install
```

Build the plugin:

```sh
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault's plugin folder (`<your-vault>/.obsidian/plugins/project-planner/`), then open Obsidian **Settings → Community plugins** and enable **Project Planner**.
