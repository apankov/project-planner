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
      "  C:\\Users\\you\\MyVault\\.obsidian\\plugins\\project-planner",
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

// A plugin folder lives inside a vault's `.obsidian/plugins`. If that is not
// already there, the path is wrong — and creating it anyway is worse than
// failing, because the copy then reports success into a directory Obsidian
// never reads, which is indistinguishable from a build that did not work.
const pluginsDir = path.dirname(target.dir);
if (!fs.existsSync(pluginsDir)) {
  console.error(
    [
      `No plugins folder at ${pluginsDir}.`,
      "",
      `The target in ${target.source} does not point inside a vault. Check the`,
      "path against the vaults Obsidian knows about, listed in",
      "%APPDATA%/obsidian/obsidian.json (or ~/.config/obsidian/obsidian.json).",
    ].join("\n")
  );
  process.exit(1);
}

fs.mkdirSync(target.dir, { recursive: true });

// Obsidian enables a plugin by folder name and identifies it by the `id` in
// the manifest beside it. Overwriting an id that a vault already has enabled
// unenables the plugin and orphans its settings, so an id already in the
// target wins over the one just built.
const manifestPath = path.join(target.dir, "manifest.json");
const built = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
let manifest = built;

if (fs.existsSync(manifestPath)) {
  try {
    const installed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (installed.id && installed.id !== built.id) {
      manifest = { ...built, id: installed.id, name: installed.name };
      console.warn(
        `Keeping the installed plugin id "${installed.id}" ` +
          `(this build calls itself "${built.id}").`
      );
    }
  } catch {
    // An unreadable manifest is replaced rather than deferred to
  }
}

for (const file of ARTIFACTS) {
  if (file === "manifest.json") {
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 4)}\n`);
  } else {
    fs.copyFileSync(file, path.join(target.dir, file));
  }
  console.log(`copied ${file}`);
}

console.log(`\nDeployed to ${target.dir} (from ${target.source}).`);
console.log(
  'Reload Obsidian (Ctrl+P -> "Reload app without saving") to load the new build.'
);
