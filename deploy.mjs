import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Files Obsidian loads for a plugin. `data.json` lives in the target folder
// too, but it holds live user settings and must never be overwritten.
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const TARGET_FILE = ".obsidian-plugin-dir";
const BUILD_OUTPUTS = ["main.js", "styles.css"];

function resolveTarget() {
  const fromEnv = process.env.OBSIDIAN_PLUGIN_DIR?.trim();
  if (fromEnv) return { dir: fromEnv, source: "OBSIDIAN_PLUGIN_DIR" };

  if (fs.existsSync(TARGET_FILE)) {
    const line = fs
      .readFileSync(TARGET_FILE, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    if (line) return { dir: line, source: TARGET_FILE };
  }

  return null;
}

const target = resolveTarget();

if (!target) {
  console.error(
    [
      "No deploy target configured.",
      "",
      `Create a ${TARGET_FILE} file (git-ignored) containing the path to your`,
      "vault's plugin folder, for example:",
      "",
      "  C:\\Users\\you\\MyVault\\.obsidian\\plugins\\tasks-map",
      "",
      "or set the OBSIDIAN_PLUGIN_DIR environment variable to the same path.",
    ].join("\n")
  );
  process.exit(1);
}

const missing = BUILD_OUTPUTS.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(
    `Missing build output: ${missing.join(", ")}. Run \`npm run build\` first.`
  );
  process.exit(1);
}

if (path.basename(target.dir) !== "tasks-map") {
  console.warn(
    `Warning: target folder is not named "tasks-map" (${target.dir}).`
  );
}

fs.mkdirSync(target.dir, { recursive: true });

for (const file of ARTIFACTS) {
  fs.copyFileSync(file, path.join(target.dir, file));
  console.log(`copied ${file}`);
}

console.log(`\nDeployed to ${target.dir} (from ${target.source}).`);
console.log(
  'Reload Obsidian (Ctrl+P -> "Reload app without saving") to load the new build.'
);
