# Changelog

## 0.6.1 - 2026-07-01

- Generated MDX `Component` types now follow `compileOptions.jsxImportSource`, emitting React, Preact, or Solid component signatures instead of `any`.

## 0.6.0 - 2026-07-01

- For Markdown files, non-frontmatter content is now available on the `html` field, replacing `body`.
- Added support for `.mdx` files. MDX entries now generate a `Component` field instead of `html`.
- Added cleanup to remove stale generated files and empty directories when source files are removed or renamed.
- Improved pluralisation for generated collection names and types.

## 0.5.0 - 2026-06-25

- Added multi-type support using pipe syntax: `'string|number'`. The first matching type wins.
- Added validation modifiers via pipe syntax: `'string|min=3|max=6'`, `'number|min=18'`, `'date|max=1735689600000'`, `'array|min=2'`.
- Added `array` as a supported primitive type with `min`/`max` length modifiers.
- Added `BAD_MODIFIER` issue code for unparseable modifier values.
- Added `INVALID_LENGTH` issue code for string and array length constraint failures.
- Added `INVALID_SIZE` issue code for number value constraint failures.
- Single-type fields now return specific issue codes (e.g. `INVALID_DATE` for invalid dates, `INVALID_TYPE` for wrong type) instead of a generic message.
- Multi-type fields return a single `INVALID_TYPE` issue listing all attempted types when no type matches.
- Moved validation logic into `src/validate.ts`.

## 0.4.1 - 2026-06-23

- Updated README to reflect the new schema API and removed outdated markdown-it references.

## 0.4.0 - 2026-06-23

- Breaking: replaced the verbose schema API with a simplified string-based syntax. Fields are now declared as `fieldName: 'type'` instead of `fieldName: { type: 'type' }`, optional fields use a `?` suffix (e.g. `'metadata?'`), and nested objects are declared inline without a `schema` wrapper.
- Added LRU file cache with bounded size and promotion-on-read to skip redundant disk writes during rebuilds.
- Added structured error codes to validation issues (`INVALID_INPUT`, `UNKNOWN_KEY`, `MISSING_REQUIRED`, `INVALID_TYPE`, `INVALID_DATE`) for programmatic error handling.
- Added date coercion support for `Date` objects and numeric timestamps in addition to strings.
- Added unknown key detection during validation — fields not declared in the schema now produce an `UNKNOWN_KEY` issue.
- Added GitHub Actions CI workflow to run tests on push and pull requests.
- Moved tests to a standalone `test.ts` file with a dedicated vitest config.
- Updated the basic example and removed the components example.
- Breaking: replaced `markdown-it-ts` with `satteri` for Rust-powered markdown parsing. The plugin config now uses `compileOptions` (from satteri) instead of the previous `markdown.plugins` and `markdown.config` structure.

## 0.3.0 - 2026-05-21

- Breaking: moved markdown customization under the `markdown` key, replacing the old root-level `plugins` option with `markdown.plugins`.
- Replaced the HTML renderer dependency with `markdown-it-ts` and added `markdown.config` support for renderer options.
- Re-exported `MarkdownItConfig` from `@jk2908/mdsrc` so consumers can type markdown renderer config without importing from `markdown-it-ts` directly.
- Updated the README examples to document the nested markdown config and the default renderer options merge.

## 0.2.0 - 2026-05-07

- Breaking: replaced the generated `body` field with `html` and `markdown` on every entry.
- Added markdown rendering through `markdown-it`, with hard line breaks preserved and raw HTML escaped by default.
- Added root-level `plugins` support for shared markdown-it plugins across every collection.
- Moved the publishable package into `packages/mdsrc` and updated the examples to consume `@jk2908/mdsrc` like a normal installed package.
- Fixed generated `.mdsrc` declarations so consumers pick up the `html` and `markdown` fields correctly.

## 0.1.4 - 2026-04-27

- Fixed generated `.mdsrc/index.d.ts` to export collection symbols directly, so root `.mdsrc` imports like `import { allPosts } from '../../.mdsrc'` typecheck correctly.
- Fixed `@jk2908/mdsrc` runtime imports in Vite apps by resolving the package name to generated collection data instead of the plugin package entry.
- Switched generated collection module filenames to lowercase while keeping the exported symbol names unchanged.