# Changelog

## 0.4.0 - 2026-06-23

- Breaking: replaced the verbose schema API with a simplified string-based syntax. Fields are now declared as `fieldName: 'type'` instead of `fieldName: { type: 'type' }`, optional fields use a `?` suffix (e.g. `'metadata?'`), and nested objects are declared inline without a `schema` wrapper.
- Added LRU file cache with bounded size and promotion-on-read to skip redundant disk writes during rebuilds.
- Added structured error codes to validation issues (`INVALID_INPUT`, `UNKNOWN_KEY`, `MISSING_REQUIRED`, `INVALID_TYPE`, `INVALID_DATE`) for programmatic error handling.
- Added date coercion support for `Date` objects and numeric timestamps in addition to strings.
- Added unknown key detection during validation — fields not declared in the schema now produce an `UNKNOWN_KEY` issue.
- Added GitHub Actions CI workflow to run tests on push and pull requests.
- Moved tests to a standalone `test.ts` file with a dedicated vitest config.
- Updated the basic example and removed the components example.
- Use `satteri` for Rust powered markdown parsing.

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