import React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { AppContext } from "src/contexts/context";
import { OPEN_QUESTIONS_VIEW_TYPE } from "src/lib/view-focus";
import ProjectPlannerPlugin from "../main";
import OpenQuestionsView from "./OpenQuestionsView";
import { t } from "../i18n";

export { OPEN_QUESTIONS_VIEW_TYPE };

export default class ProjectPlannerOpenQuestionsItemView extends ItemView {
  root: Root | null = null;
  plugin: ProjectPlannerPlugin;

  /**
   * The plugin is handed in rather than looked up, for the same reason the
   * other views take it: a view that finds its plugin by folder name breaks the
   * moment the folder is renamed.
   */
  constructor(leaf: WorkspaceLeaf, plugin: ProjectPlannerPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return OPEN_QUESTIONS_VIEW_TYPE;
  }

  getDisplayText() {
    return t("open_questions.view_title");
  }

  getIcon() {
    return "help-circle";
  }

  /**
   * No Dataview check. Dataview only indexes checkbox lines, so it could not
   * find an open question anyway — the questions are read straight off the
   * files, which makes this the one view that still opens without it.
   */
  async onOpen() {
    this.root = createRoot(this.containerEl.children[1]);

    this.root.render(
      <AppContext.Provider value={this.app}>
        <OpenQuestionsView plugin={this.plugin} />
      </AppContext.Provider>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}
