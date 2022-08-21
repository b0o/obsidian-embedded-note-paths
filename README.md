## Obsidian Embedded Note Paths Plugin

This plugin embeds the note title at the top of each note in both preview and edit mode. This plugin does not modify notes, and the title is not a part of the document itself.

**Features:**

- The embedded paths can be styled using the Style Settings plugin
- Paths can be hidden or overridden by a file's frontmatter
- Paths can be hidden if when a level 1 heading is present
- Leading/trailing slashes can be enabled if desired

<img src="https://user-images.githubusercontent.com/21299126/185779567-ba379655-9ed7-495c-841c-112a76101698.png" alt="Screenshot of embedded paths plugin" />

### Note

In general, this plugin attempts to size the paths to align with the note content. Some themes may have styling that conflicts with these calculations. If you notice misalignment between the title and the note, the paths can be styled via css like so:

```css
h1.embedded-note-title {
  /* ...reading mode styles... */
}

h1.cm-line.embedded-note-title {
  /* ... live preview / edit mode styles ... */
}
```

You may also need to account for readable line length:

```css
.is-readable-line-width h1.embedded-note-title {
  /* ...reading mode styles... */
}

.is-readable-line-width h1.cm-line.embedded-note-title {
  /* ...reading mode styles... */
}
```

## Credits

This plugin is a fork of [mgmeyers/obsidian-embedded-note-titles](https://github.com/mgmeyers/obsidian-embedded-note-titles) with a few changes.
