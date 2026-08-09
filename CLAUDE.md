# CLAUDE.md

Obsidian plugin that renders vault tasks as an interactive graph, a Gantt
chart, and a finance view. Tasks come from the **Dataview** plugin at runtime —
it (and Tasks) must be installed in the vault or the views refuse to render.

`AGENTS.md` holds the detailed code-style guide (imports, naming, React
patterns, error handling). Read it before writing code; this file covers stack,
commands, layout, architecture, and hard rules.

## Stack

| Piece      | Version / note                                              |
| ---------- | ----------------------------------------------------------- |
| TypeScript | 6.0.3, `strict`, path alias `src/*`                          |
| React      | 18.3.1 (+ `react-dom`), `jsx: react-jsx`                     |
| ReactFlow  | 11.11.4 — graph canvas; `@dagrejs/dagre` for auto-layout     |
| i18next    | 26.x — locales `en`, `nl`, `zh-CN`                           |
| Other deps | `lucide-react` (icons), `react-select`                       |
| Bundler    | esbuild 0.28.1 → CommonJS, target `es2018`                   |
| Tests      | Jest 30 + ts-jest, `testEnvironment: node`                   |
| Node       | 24 required (`.nvmrc`, `engines`); `.npmrc` sets `legacy-peer-deps` |

## Commands

| Command                 | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | esbuild watch build                                    |
| `npm run build`         | `tsc -noEmit -skipLibCheck` + production bundle        |
| `npm run build:deploy`  | Build, then copy artifacts into the local vault        |
| `npm test`              | Jest                                                   |
| `npm run test:coverage` | Jest with coverage (thresholds are deliberately low)   |
| `npm run lint`          | ESLint over `src/**/*.{ts,tsx}` (`:fix` to autofix)    |
| `npm run lint:css`      | Stylelint over `*.css` + `src/**/*.css`                |
| `npm run format`        | Prettier check over `src/**` (`:fix` to write)         |

Single test: `npx jest test/task-factory.test.ts -t "extracts emoji-format ID"`.

CI (`.github/workflows/qualify.yaml`) runs lint, stylelint, prettier, tsc,
build, and tests — the same commands. `prek` hooks run lint + lint:css + format
pre-commit.

Deploy target comes from `.obsidian-plugin-dir` (gitignored) or
`$OBSIDIAN_PLUGIN_DIR`; `deploy.mjs` copies `main.js`, `manifest.json`,
`styles.css` and never touches the vault's `data.json`.

## Layout

```
src/
├── main.tsx          # Plugin entry: registers views, commands, ribbons, embed
├── views/            # *ItemView.tsx = Obsidian shell; *View.tsx = React root
├── components/       # React UI (kebab-case); *-modal.ts are Obsidian Modals
├── lib/              # Pure logic — the unit-tested core
├── types/            # BaseTask + subclasses, settings, filter/embed config
├── contexts/         # AppContext, TagsContext
├── hooks/            # useApp, summary renderer, undo history
├── settings/         # Settings tab
└── i18n/             # i18next setup + locales/{en,nl,zh-CN}.json
test/
├── *.test.ts         # Mirrors src/lib/ filenames
├── mocks/            # obsidian, react, reactflow, lucide-react, react-select
└── fixture/          # Sample vault (Dataview + NoteTask + Finance notes)
global.css            # THE stylesheet source; esbuild emits styles.css
docs/                 # Zensical site → nicoknl.github.io/tasks-map
```

## Architecture

- **Three views + one embed.** Graph, Gantt, and Finance each pair an Obsidian
  `ItemView` (`TasksMapGanttItemView.tsx`) with a React component
  (`GanttView.tsx`); the ItemView owns `createRoot`. A `tasks-map` fenced code
  block renders the graph inline via `registerMarkdownCodeBlockProcessor`.
- **View ids live in `src/lib/view-focus.ts`**, not in `main.tsx`, because the
  plugin imports the views — views importing the plugin for a runtime value
  would form a cycle. Same module owns the cross-view "focus this task" event.
- **Settings propagate by window event.** `main.tsx` dispatches
  `tasks-map:settings-changed`; every view wrapper listens and re-clones
  `plugin.settings`. There is no settings store.
- **Domain model.** Abstract `BaseTask` → `DataviewTask` (inline `- [ ]` lines)
  and `NoteTask` (a whole note tagged `task`). Always construct via
  `TaskFactory.parse()`. All parsing regexes live in `src/lib/task-regex.ts` —
  add new ones there, not inline.
- **`src/lib/` is pure and framework-free** (scheduling, critical path, finance,
  cost, gantt rows, filtering, graph traversal). New logic goes here with a
  matching `test/*.test.ts`; React files stay presentational.
- **Undo is plugin-scoped.** One `UndoHistory` instance on the plugin, shared so
  either view can undo the other's edits.
- **Companion notes** (`src/lib/companion-note.ts`) are a note per task and are
  deliberately *not* tagged `task` — tagging one would make it a second node.
- **State** is `useState` + Context only. No Redux/Zustand/Jotai.
- Vault writes use optimistic UI with rollback in `catch`.

## Never do this

- **Never edit `main.js` or `styles.css`.** Both are generated build output and
  gitignored. Style changes go in `global.css`, which esbuild compiles into
  `styles.css`.
- **Never bundle `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`, or Node
  builtins.** They are esbuild externals; adding one to the bundle breaks the
  plugin at load.
- **Never use inline `style` JSX props or create `<style>` elements at
  runtime.** Both are ESLint `no-restricted-syntax` errors. Use a class.
- **Never use `any`** (`@typescript-eslint/no-explicit-any: error`). For
  Obsidian internals, prefer `src/types/obsidian-internals.ts`, else a
  one-line targeted `eslint-disable-next-line`.
- **Never hardcode a user-facing string.** Use `t()` and add the key to *all
  three* locale files — a missing key ships as a raw key.
- **Never name a test file `.test.tsx`.** Jest's `testMatch` is `**/*.test.ts`
  only, so a `.tsx` test is silently never run.
- **Never hand-edit version fields** in `package.json`, `package-lock.json`,
  `manifest.json`, or `versions.json`. The release workflow owns them via
  `semver-config.toml` + `.github/scripts/bump_version.py`.
- **CSS class names must match** `^(tasks-map-|react-flow|theme-dark)…`
  (stylelint `selector-class-pattern`), and `!important` is banned.
- **Never overwrite a vault's `data.json`** — it holds live user settings.
