import { StateEffect } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { App, CachedMetadata, editorViewField, MarkdownView } from "obsidian";
import { getDateFromFile } from "obsidian-daily-notes-interface";
import { hidePathField, Settings } from "./settings";
import EmbeddedNotePathsPlugin from "./main";

export const updatePath = StateEffect.define<void>();

function shouldHide(cache: CachedMetadata, settings: Settings) {
  if (
    settings.hideOnMetadataField &&
    cache?.frontmatter &&
    cache.frontmatter[hidePathField] === false
  ) {
    return true;
  }

  if (settings.hideOnH1 && cache?.sections) {
    if (!cache.headings) return false;

    if (
      cache.sections &&
      cache.sections[0]?.type === "heading" &&
      cache.headings &&
      cache.headings[0]?.level === 1
    ) {
      return true;
    }

    if (
      cache.sections &&
      cache.sections[0]?.type === "yaml" &&
      cache.sections[1]?.type === "heading" &&
      cache.headings[0]?.level === 1
    ) {
      return true;
    }
  }

  return false;
}

export function getPathForView(
  app: App,
  settings: Settings,
  view: MarkdownView
) {
  const frontmatterKey = settings.pathMetadataField;
  const file = view.file;

  let path = file?.path?.includes("/") && file?.path?.replace(/^(.*)\/.*/, "$1")
  if (settings.displayLeadingSlash) {
    path = path  && `/${path}`
  }
  if (settings.displayTrailingSlash) {
    path = path && `${path}/`
  }

  if (file) {
    const cache = app.metadataCache.getFileCache(file);

    if (shouldHide(cache, settings)) {
      return " ";
    }

    if (
      frontmatterKey &&
      cache?.frontmatter &&
      cache.frontmatter[frontmatterKey]
    ) {
      return cache.frontmatter[frontmatterKey] || path || " ";
    }
  }

  if (file && settings.dailyNotePathFormat) {
    const date = getDateFromFile(file, "day");

    if (date) {
      return date.format(settings.dailyNotePathFormat);
    }
  }

  return path || " ";
}

export function buildPathDecoration(
  plugin: EmbeddedNotePathsPlugin,
  getSettings: () => Settings
) {
  return [
    ViewPlugin.fromClass(
      class {
        header: HTMLElement;
        path: string;
        debounce: number;

        constructor(view: EditorView) {
          this.path = getPathForView(
            plugin.app,
            getSettings(),
            view.state.field(editorViewField)
          );

          // This shouldn't happen, but just to be safe, remove any straggling paths
          view.contentDOM.parentElement.childNodes.forEach((node) => {
            if (
              node instanceof HTMLElement &&
              node.hasClass("embedded-note-path")
            ) {
              plugin.unobservePath(node);
              node.remove();
            }
          });

          this.header = createEl("code", {
            text: this.path,
            cls: `cm-line embedded-note-path embedded-note-path__edit${
              this.path === " " ? " embedded-note-path__hidden" : ""
            }`,
            attr: {
              id: "path-cm6-" + Math.random().toString(36).substr(2, 9),
              style: "font-style: italic; opacity: 0.5; font-size: 1rem;",
            },
          });

          setTimeout(() => {
            view.contentDOM.before(this.header);
          })

          plugin.observePath(this.header, (entry) => {
            if (entry.borderBoxSize[0]) {
              this.adjustGutter(entry.borderBoxSize[0].blockSize);
            } else {
              this.adjustGutter(entry.contentRect.height);
            }
          });

          this.adjustGutter(this.header.getBoundingClientRect().height);
        }

        adjustGutter(padding: number) {
          clearTimeout(this.debounce);

          this.debounce = window.setTimeout(() => {
            const dom = this.header?.closest(".markdown-source-view");

            if (!dom) return;

            let currentStyle = dom.getAttr("style");

            if (!currentStyle) {
              currentStyle = "";
            }

            if (currentStyle.contains("--embedded-note")) {
              currentStyle = currentStyle.replace(
                /--embedded-note-path-height: \d+px;/g,
                ""
              );
            }

            if (currentStyle && !currentStyle.endsWith(";")) {
              currentStyle += `;--embedded-note-path-height: ${padding}px;`;
            } else {
              currentStyle += `--embedded-note-path-height: ${padding}px;`;
            }

            dom.setAttribute("style", currentStyle);
          }, 10);
        }

        revertGutter() {
          const dom = this.header.closest(".markdown-source-view");
          let currentStyle = dom.getAttr("style");

          if (currentStyle && currentStyle.contains("--embedded-note")) {
            currentStyle = currentStyle.replace(
              /--embedded-note-path-height: \d+px;/g,
              ""
            );

            dom.setAttribute("style", currentStyle);
          }
        }

        update(viewUpdate: ViewUpdate) {
          viewUpdate.transactions.forEach((tr) => {
            for (let e of tr.effects) {
              if (e.is(updatePath)) {
                const newPath = getPathForView(
                  plugin.app,
                  getSettings(),
                  tr.state.field(editorViewField)
                );

                if (this.path === newPath) {
                  return;
                }

                this.path = newPath;
                this.header.setText(this.path);

                if (this.path === " ") {
                  this.header.classList.add("embedded-note-path__hidden");
                } else {
                  this.header.classList.remove("embedded-note-path__hidden");
                }
              }
            }
          });
        }

        destroy() {
          plugin.unobservePath(this.header);
          this.header.remove();
          this.header = null;
        }
      }
    ),
  ];
}
