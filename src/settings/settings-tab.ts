import { App, PluginSettingTab, Setting } from "obsidian";
import TasksMapPlugin from "../main";
import {
  TagColorName,
  TagColorPalette,
  TAG_COLOR_DEFAULT,
  TAG_COLOR_NAMES,
  getTagColorClass,
  setTagColorOverride,
} from "../lib/tag-color-manager";
import { getAllTasks } from "../lib/utils";
import { DEFAULT_COMPANION_FOLDER } from "../lib/companion-note";
import { t } from "../i18n";
import { SUPPORTED_LANGUAGES } from "../i18n";

export class TasksMapSettingTab extends PluginSettingTab {
  plugin: TasksMapPlugin;

  constructor(app: App, plugin: TasksMapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private createTagPreview(
    container: HTMLElement,
    tags: string[],
    palette: TagColorPalette
  ): void {
    container.empty();

    const previewDiv = container.createDiv({
      cls: "tasks-map-tag-preview-container",
    });

    tags.forEach((tag) => {
      previewDiv.createSpan({
        cls: `tasks-map-tag ${getTagColorClass(tag, palette)}`,
        text: tag,
      });
    });
  }

  /**
   * Every tag currently used by a task, plus any tag that still has a manual
   * color assigned (so an override can be cleared after the tag disappears).
   */
  private getKnownTags(): string[] {
    const tags = new Set<string>();
    try {
      getAllTasks(this.app).forEach((task) => {
        task.tags.forEach((tag) => tags.add(tag));
      });
    } catch {
      // Dataview may not be ready yet; overrides below still render
    }
    Object.keys(this.plugin.settings.tagColorOverrides).forEach((tag) =>
      tags.add(tag)
    );
    return Array.from(tags).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }

  /**
   * Renders one row per tag: a live chip preview plus a color dropdown that
   * defaults to the palette color.
   */
  private createTagColorRows(
    container: HTMLElement,
    tags: string[],
    query: string
  ): void {
    container.empty();

    const normalizedQuery = query.trim().toLowerCase();
    const visibleTags = normalizedQuery
      ? tags.filter((tag) => tag.toLowerCase().includes(normalizedQuery))
      : tags;

    if (visibleTags.length === 0) {
      container.createDiv({
        cls: "tasks-map-tag-color-empty",
        text:
          tags.length === 0
            ? t("settings.no_tags_found")
            : t("settings.no_tags_match"),
      });
      return;
    }

    visibleTags.forEach((tag) => {
      const setting = new Setting(container);
      setting.settingEl.addClass("tasks-map-tag-color-row");
      const chip = setting.nameEl.createSpan({
        cls: `tasks-map-tag ${getTagColorClass(
          tag,
          this.plugin.settings.tagColorPalette,
          this.plugin.settings.tagColorOverrides
        )}`,
        text: tag,
      });

      setting.addDropdown((dropdown) => {
        dropdown.addOption(TAG_COLOR_DEFAULT, t("settings.tag_color_theme"));
        TAG_COLOR_NAMES.forEach((color) => {
          dropdown.addOption(color, t(`settings.tag_color_${color}`));
        });
        dropdown
          .setValue(
            this.plugin.settings.tagColorOverrides[tag] ?? TAG_COLOR_DEFAULT
          )
          .onChange(async (value) => {
            this.plugin.settings.tagColorOverrides = setTagColorOverride(
              this.plugin.settings.tagColorOverrides,
              tag,
              value as TagColorName | typeof TAG_COLOR_DEFAULT
            );
            await this.plugin.saveSettings();
            chip.className = `tasks-map-tag ${getTagColorClass(
              tag,
              this.plugin.settings.tagColorPalette,
              this.plugin.settings.tagColorOverrides
            )}`;
          });
      });
    });
  }

  display(): void {
    const { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.language_desc"))
      .addDropdown((dropdown) => {
        SUPPORTED_LANGUAGES.forEach((lang) => {
          dropdown.addOption(lang.value, lang.label);
        });
        dropdown
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "en" | "nl" | "zh-CN";
            await this.plugin.saveSettings();
            // Redraw the settings tab with new language
            this.display();
          });
      });

    new Setting(containerEl)
      .setHeading()
      .setName(t("settings.display_options"));

    new Setting(containerEl)
      .setName(t("settings.show_task_priorities"))
      .setDesc(t("settings.show_task_priorities_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showPriorities)
          .onChange(async (value) => {
            this.plugin.settings.showPriorities = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.show_task_tags"))
      .setDesc(t("settings.show_task_tags_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showTags)
          .onChange(async (value) => {
            this.plugin.settings.showTags = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.show_status_counts"))
      .setDesc(t("settings.show_status_counts_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showStatusCounts)
          .onChange(async (value) => {
            this.plugin.settings.showStatusCounts = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setHeading().setName(t("settings.layout"));

    new Setting(containerEl)
      .setName(t("settings.layout_direction"))
      .setDesc(t("settings.layout_direction_desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Horizontal", t("settings.layout_horizontal"))
          .addOption("Vertical", t("settings.layout_vertical"))
          .setValue(this.plugin.settings.layoutDirection)
          .onChange(async (value) => {
            this.plugin.settings.layoutDirection = value as
              "Horizontal" | "Vertical";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.edge_style"))
      .setDesc(t("settings.edge_style_desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("Bezier", t("settings.edge_style_bezier"))
          .addOption("Straight", t("settings.edge_style_straight"))
          .addOption("SmoothStep", t("settings.edge_style_smoothstep"))
          .setValue(this.plugin.settings.edgeStyle)
          .onChange(async (value) => {
            this.plugin.settings.edgeStyle = value as
              "Bezier" | "Straight" | "SmoothStep";
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.edgeStyle === "SmoothStep") {
      new Setting(containerEl)
        .setName(t("settings.smooth_step_radius"))
        .setDesc(t("settings.smooth_step_radius_desc"))
        .addText((text) =>
          text
            .setPlaceholder("5")
            .setValue(this.plugin.settings.smoothStepRadius.toString())
            .onChange(async (value) => {
              const radius = Math.max(0, parseInt(value) || 0);
              this.plugin.settings.smoothStepRadius = radius;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl).setHeading().setName(t("settings.tag_appearance"));

    new Setting(containerEl)
      .setName(t("settings.tag_color_palette"))
      .setDesc(t("settings.tag_color_palette_desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("rainbow", t("settings.palette_rainbow"))
          .addOption("ocean", t("settings.palette_ocean"))
          .addOption("forest", t("settings.palette_forest"))
          .addOption("sunset", t("settings.palette_sunset"))
          .addOption("mono", t("settings.palette_mono"))
          .setValue(this.plugin.settings.tagColorPalette)
          .onChange(async (value) => {
            this.plugin.settings.tagColorPalette = value as TagColorPalette;
            await this.plugin.saveSettings();
            this.createTagPreview(
              tagPreviewContainer,
              ["priority", "bug", "feature", "docs", "blocked"],
              value as TagColorPalette
            );
            this.createTagColorRows(tagColorList, knownTags, tagColorQuery);
          });
      });

    const tagPreviewContainer = containerEl.createDiv();
    this.createTagPreview(
      tagPreviewContainer,
      ["priority", "bug", "feature", "docs", "blocked"],
      this.plugin.settings.tagColorPalette
    );

    const knownTags = this.getKnownTags();
    let tagColorQuery = "";

    const tagColorsSetting = new Setting(containerEl)
      .setName(t("settings.tag_colors"))
      .setDesc(t("settings.tag_colors_desc"))
      .addSearch((search) => {
        search
          .setPlaceholder(t("settings.tag_colors_search_placeholder"))
          .onChange((value) => {
            tagColorQuery = value;
            this.createTagColorRows(tagColorList, knownTags, tagColorQuery);
          });
      });

    tagColorsSetting.addButton((button) => {
      button
        .setButtonText(t("settings.tag_colors_reset"))
        .setTooltip(t("settings.tag_colors_reset_desc"))
        .onClick(async () => {
          this.plugin.settings.tagColorOverrides = {};
          await this.plugin.saveSettings();
          this.createTagColorRows(tagColorList, knownTags, tagColorQuery);
        });
    });

    const tagColorList = containerEl.createDiv({
      cls: "tasks-map-tag-color-list",
    });
    this.createTagColorRows(tagColorList, knownTags, tagColorQuery);

    new Setting(containerEl).setHeading().setName(t("settings.task_creation"));

    new Setting(containerEl)
      .setName(t("settings.companion_notes"))
      .setDesc(t("settings.companion_notes_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.createCompanionNotes)
          .onChange(async (value) => {
            this.plugin.settings.createCompanionNotes = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(t("settings.companion_note_folder"))
      .setDesc(t("settings.companion_note_folder_desc"))
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_COMPANION_FOLDER)
          .setValue(this.plugin.settings.companionNoteFolder)
          .onChange(async (value) => {
            this.plugin.settings.companionNoteFolder =
              value.trim() || DEFAULT_COMPANION_FOLDER;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setHeading()
      .setName(t("settings.simple_task_relations"));

    new Setting(containerEl)
      .setName(t("settings.linking_style"))
      .setDesc(t("settings.linking_style_desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("csv", t("settings.linking_csv"))
          .addOption("individual", t("settings.linking_individual"))
          .addOption("dataview", t("settings.linking_dataview"))
          .setValue(this.plugin.settings.linkingStyle)
          .onChange(async (value) => {
            this.plugin.settings.linkingStyle = value as
              "individual" | "csv" | "dataview";
            await this.plugin.saveSettings();
            updatePreview(value as "individual" | "csv" | "dataview");
          })
      );

    // Create preview container
    const previewContainer = containerEl.createDiv();
    previewContainer.addClass("tasks-map-preview-container");

    const updatePreview = (style: "individual" | "csv" | "dataview") => {
      previewContainer.empty();

      if (style === "individual") {
        const title = previewContainer.createDiv({
          cls: "tasks-map-preview-title",
        });
        title.textContent = t("settings.linking_individual_title");

        const desc = previewContainer.createDiv({
          cls: "tasks-map-preview-desc",
        });
        desc.textContent = t("settings.linking_individual_desc");

        const example = previewContainer.createDiv({
          cls: "tasks-map-preview-example",
        });
        example.textContent = t("settings.linking_individual_example");
      } else if (style === "dataview") {
        const title = previewContainer.createDiv({
          cls: "tasks-map-preview-title",
        });
        title.textContent = t("settings.linking_dataview_title");

        const desc = previewContainer.createDiv({
          cls: "tasks-map-preview-desc",
        });
        desc.textContent = t("settings.linking_dataview_desc");

        const example = previewContainer.createDiv({
          cls: "tasks-map-preview-example",
        });
        example.textContent = t("settings.linking_dataview_example");
      } else {
        const title = previewContainer.createDiv({
          cls: "tasks-map-preview-title",
        });
        title.textContent = t("settings.linking_csv_title");

        const desc = previewContainer.createDiv({
          cls: "tasks-map-preview-desc",
        });
        desc.textContent = t("settings.linking_csv_desc");

        const example = previewContainer.createDiv({
          cls: "tasks-map-preview-example",
        });
        example.textContent = t("settings.linking_csv_example");
      }
    };

    // Initialize preview
    updatePreview(this.plugin.settings.linkingStyle);

    new Setting(containerEl)
      .setHeading()
      .setName(t("settings.advanced_options"));

    new Setting(containerEl)
      .setName(t("settings.debug_visualization"))
      .setDesc(t("settings.debug_visualization_desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.debugVisualization)
          .onChange(async (value) => {
            this.plugin.settings.debugVisualization = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
