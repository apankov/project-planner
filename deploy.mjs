import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// Files Obsidian loads for a plugin. `data.json` lives in the target folder
// too, but it holds live user settings and must never be overwritten.
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];
const TARGET_FILE = ".obsidian-plugin-dir";
const BUILD_OUTPUTS = ["main.js", "styles.css"];

/**
 * Every folder to deploy into, in order.
 *
 * More than one is allowed because a vault can carry the same plugin under two
 * folders — a rename leaves the old id enabled, and the enabled one is the one
 * that has to be updated for a change to be visible at all.
 */
function resolveTargets() {
  const fromEnv = process.env.OBSIDIAN_PLUGIN_DIR?.trim();
  if (fromEnv) {
    return { dirs: [fromEnv], source: "OBSIDIAN_PLUGIN_DIR" };
  }

  if (fs.existsSync(TARGET_FILE)) {
    const dirs = fs
      .readFileSync(TARGET_FILE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    if (dirs.length > 0) return { dirs, source: TARGET_FILE };
  }

  return null;
}

const target = resolveTargets();

if (!target) {
  console.error(
    [
      "No deploy target configured.",
      "",
      `Create a ${TARGET_FILE} file (git-ignored) containing the path to your`,
      "vault's plugin folder, one per line, for example:",
      "",
      "  C:\\Users\\you\\MyVault\\.obsidian\\plugins\\project-planner",
      "",
      "or set the OBSIDIAN_PLUGIN_DIR environment variable to one such path.",
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

const built = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

/**
 * The manifest to write into a folder.
 *
 * An id already installed there wins. Obsidian enables a plugin by folder name
 * and reads its id from the manifest beside it, so writing a new id into a
 * folder a vault has enabled unenables the plugin and orphans its settings —
 * which is what the rename to `project-planner` did to vaults running the older
 * `tasks-map`. Nothing in the plugin reads its own id any more (the views take
 * their instance from `registerView`), so running under the older one is safe.
 */
function manifestFor(dir) {
  const installedPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(installedPath)) return built;

  try {
    const installed = JSON.parse(fs.readFileSync(installedPath, "utf8"));
    if (installed.id && installed.id !== built.id) {
      console.log(`  keeping installed id "${installed.id}"`);
      return { ...built, id: installed.id, name: installed.name };
    }
  } catch {
    // An unreadable manifest is replaced rather than deferred to
  }

  return built;
}

for (const dir of target.dirs) {
  // A plugin folder lives inside a vault's `.obsidian/plugins`. If that is not
  // already there, the path is wrong — and creating it anyway is worse than
  // failing, because the copy then reports success into a directory Obsidian
  // never reads, which is indistinguishable from a build that did not work.
  const pluginsDir = path.dirname(dir);
  if (!fs.existsSync(pluginsDir)) {
    console.error(
      [
        `No plugins folder at ${pluginsDir}.`,
        "",
        `The target in ${target.source} does not point inside a vault. Check`,
        "the path against the vaults Obsidian knows about, listed in",
        "%APPDATA%/obsidian/obsidian.json (or ~/.config/obsidian/obsidian.json).",
      ].join("\n")
    );
    process.exit(1);
  }

  console.log(dir);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = manifestFor(dir);

  for (const file of ARTIFACTS) {
    if (file === "manifest.json") {
      fs.writeFileSync(
        path.join(dir, file),
        `${JSON.stringify(manifest, null, 4)}\n`
      );
    } else {
      fs.copyFileSync(file, path.join(dir, file));
    }
  }
  console.log(`  copied ${ARTIFACTS.join(", ")}`);
}

console.log(
  `\nDeployed to ${target.dirs.length} folder(s) (from ${target.source}).`
);
console.log(
  'Reload Obsidian (Ctrl+P -> "Reload app without saving") to load the new build.'
);
