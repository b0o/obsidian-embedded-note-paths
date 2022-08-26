import { EditorView } from "@codemirror/view";
import {
  App,
  MarkdownView,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
} from "obsidian";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";
import { PreviewHeadingsManager } from "./HeadingsManager";
import { Settings } from "./settings";
import { buildPathDecoration, updatePath } from "./pathDecoration";

export default class EmbeddedNotePathsPlugin extends Plugin {
  settings: Settings;
  isLegacyEditor: boolean;

  previewHeadingsManager: PreviewHeadingsManager;

  observer: ResizeObserver;
  observedPaths: Map<HTMLElement, (entry: ResizeObserverEntry) => void>;

  async onload() {
    document.body.classList.add("embedded-note-paths");

    await this.loadSettings();

    this.addSettingTab(new EmbeddedNotePathsSettings(this.app, this));

    const getSettings = () => this.settings;

    this.app.workspace.trigger("parse-style-settings");
    this.previewHeadingsManager = new PreviewHeadingsManager(getSettings);
    this.isLegacyEditor = (this.app.vault as any).getConfig("legacyEditor");

    if (!this.isLegacyEditor) {
      this.observedPaths = new Map();
      this.observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          if (this.observedPaths.has(entry.target as HTMLElement)) {
            this.observedPaths.get(entry.target as HTMLElement)(entry);
          }
        });
      });

      this.registerEditorExtension(buildPathDecoration(this, getSettings));

      const notifyFileChange = (file: TFile) => {
        const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");

        markdownLeaves.forEach((leaf) => {
          const view = leaf.view as MarkdownView;

          if (view.file === file) {
            ((view.editor as any).cm as EditorView).dispatch({
              effects: updatePath.of(),
            });
          }
        });
      };

      this.registerEvent(this.app.vault.on("rename", notifyFileChange));

      this.registerEvent(
        this.app.metadataCache.on("changed", (file) => {
          const frontmatterKey = this.settings.pathMetadataField;
          const hideOnH1 = this.settings.hideOnH1;

          if (frontmatterKey || hideOnH1) {
            notifyFileChange(file);
          }
        })
      );
    }

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const frontmatterKey = this.settings.pathMetadataField;
        const hideOnH1 = this.settings.hideOnH1;

        if (frontmatterKey || hideOnH1) {
          const cache = this.app.metadataCache.getFileCache(file);

          if (
            hideOnH1 ||
            (frontmatterKey &&
              cache?.frontmatter &&
              cache.frontmatter[frontmatterKey])
          ) {
            setTimeout(() => {
              this.previewHeadingsManager.createHeadings(this.app);
            }, 0);
          }
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        setTimeout(() => {
          this.previewHeadingsManager.createHeadings(this.app);
        }, 0);

        if (!this.isLegacyEditor) {
          setTimeout(() => {
            this.observedPaths.forEach((_, el) => {
              if (
                this.app.workspace
                  .getLeavesOfType("markdown")
                  .every((leaf) => !leaf.view.containerEl.find(`#${el.id}`))
              ) {
                this.unobservePath(el);
                el.remove();
              }
            });
          }, 100);
        }
      })
    );

    // Listen for CSS changes so we can recalculate heading styles
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        this.previewHeadingsManager.cleanup();

        setTimeout(() => {
          this.previewHeadingsManager.createHeadings(this.app);
        }, 0);
      })
    );

    this.app.workspace.onLayoutReady(() => {
      // Trigger layout-change to ensure headings are created when the app loads
      this.app.workspace.trigger("layout-change");
    });
  }

  onunload() {
    document.body.classList.remove("embedded-note-paths");

    this.previewHeadingsManager.cleanup();
    this.observer.disconnect();
    this.observedPaths.forEach((_, el) => {
      el.remove();
    });
    this.observedPaths.clear();
  }

  observePath(el: HTMLElement, cb: (entry: ResizeObserverEntry) => void) {
    this.observedPaths.set(el, cb);
    this.observer.observe(el, {
      box: "border-box",
    });
  }

  unobservePath(el: HTMLElement) {
    if (this.observedPaths.has(el)) {
      this.observedPaths.delete(el);
      this.observer.unobserve(el);
    }
  }

  async loadSettings() {
    this.settings = Object.assign({}, await this.loadData());
  }

  async saveSettings() {
    if (!this.isLegacyEditor) {
      const markdownLeaves = this.app.workspace.getLeavesOfType("markdown");

      markdownLeaves.forEach((leaf) => {
        const view = leaf.view as MarkdownView;

        ((view.editor as any).cm as EditorView).dispatch({
          effects: updatePath.of(),
        });
      });
    }

    this.previewHeadingsManager.cleanup();

    setTimeout(() => {
      this.previewHeadingsManager.createHeadings(this.app);
    }, 0);

    await this.saveData(this.settings);
  }
}

class EmbeddedNotePathsSettings extends PluginSettingTab {
  plugin: EmbeddedNotePathsPlugin;

  constructor(app: App, plugin: EmbeddedNotePathsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName("Frontmatter field as path")
      .setDesc(
        "When a file contains this frontmatter field, it will be used as the embedded path"
      )
      .addText((text) => {
        text
          .setValue(this.plugin.settings.pathMetadataField || "")
          .onChange(async (value) => {
            this.plugin.settings.pathMetadataField = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Hide embedded path when level 1 heading is present")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.hideOnH1)
          .onChange(async (value) => {
            this.plugin.settings.hideOnH1 = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Hide embedded path using metadata `embedded-path: false`")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.hideOnMetadataField)
          .onChange(async (value) => {
            this.plugin.settings.hideOnMetadataField = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Daily note path format")
      .then((setting) => {
        setting.addMomentFormat((mf) => {
          setting.descEl.appendChild(
            createFragment((frag) => {
              frag.appendText(
                "This format will be used when displaying paths of daily notes."
              );
              frag.createEl("br");
              frag.appendText("For more syntax, refer to ");
              frag.createEl(
                "a",
                {
                  text: "format reference",
                  href: "https://momentjs.com/docs/#/displaying/format/",
                },
                (a) => {
                  a.setAttr("target", "_blank");
                }
              );
              frag.createEl("br");
              frag.appendText("Your current syntax looks like this: ");
              mf.setSampleEl(frag.createEl("b", { cls: "u-pop" }));
              frag.createEl("br");
            })
          );

          const dailyNoteSettings = getDailyNoteSettings();
          const defaultFormat = dailyNoteSettings.format || "YYYY-MM-DD";

          mf.setPlaceholder(defaultFormat);
          mf.setDefaultFormat(defaultFormat);

          if (this.plugin.settings.dailyNotePathFormat) {
            mf.setValue(this.plugin.settings.dailyNotePathFormat);
          }

          mf.onChange(async (value) => {
            this.plugin.settings.dailyNotePathFormat = value
              ? value
              : undefined;
            await this.plugin.saveSettings();
          });
        });
      });

    new Setting(containerEl)
      .setName("Display leading slash")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.displayLeadingSlash)
          .onChange(async (value) => {
            this.plugin.settings.displayLeadingSlash = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Display trailing slash")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.displayTrailingSlash)
          .onChange(async (value) => {
            this.plugin.settings.displayTrailingSlash = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Display filename")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.displayFilename)
          .onChange(async (value) => {
            this.plugin.settings.displayFilename = value;
            await this.plugin.saveSettings();
          });
      });

  }
}
