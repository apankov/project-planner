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

// The views look their own plugin up by id — `plugins.plugins["project-planner"]`
// in each `*ItemView` — so this plugin only runs under the id it was built
// with. Deploying it into a folder a vault has enabled under some other id
// installs something that loads and then cannot open a view, which is a
// stranger failure than not deploying at all.
const manifestPath = path.join(target.dir, "manifest.json");
const built = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

if (fs.existsSync(manifestPath)) {
  try {
    const installed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (installed.id && installed.id !== built.id) {
      console.error(
        [
          `The folder ${target.dir}`,
          `holds a plugin with id "${installed.id}", but this build is`,
          `"${built.id}". The views resolve themselves by id, so the build`,
          "cannot run in that folder.",
          "",
          `Deploy into a folder named "${built.id}" instead, and enable it in`,
          "Obsidian's community plugins list. Settings are keyed by id, so copy",
          `the old folder's data.json across if you want them to follow.`,
        ].join("\n")
      );
      process.exit(1);
    }
  } catch {
    // An unreadable manifest is replaced rather than deferred to
  }
}

for (const file of ARTIFACTS) {
  fs.copyFileSync(file, path.join(target.dir, file));
  console.log(`copied ${file}`);
}

console.log(`\nDeployed to ${target.dir} (from ${target.source}).`);
console.log(
  'Reload Obsidian (Ctrl+P -> "Reload app without saving") to load the new build.'
);
