# Changelog

## [0.0.34](https://github.com/volarjs/services/compare/v0.0.33...v0.0.34) (2024-03-14)

### Bug Fixes

- **prettier:** await isFormattingEnabled [#85](https://github.com/volarjs/services/issues/85)

## [0.0.33](https://github.com/volarjs/services/compare/v0.0.32...v0.0.33) (2024-03-14)

### Bug Fixes

- **typescript:** options should be optional
- **typescript:** coee actions not working

## [0.0.32](https://github.com/volarjs/services/compare/v0.0.31...v0.0.32) (2024-03-13)

### Features

- **prettier:** don't throw an error when no Prettier instance is available [#81](https://github.com/volarjs/services/issues/81)

### Bug Fixes

- **typescript:** can't format JSX/TSX document correctly (https://github.com/vuejs/language-tools/issues/3949)

### Refactors

- all package formatting options are now consistent
- **typescript:** split the main plugin into multiple plugins [#83](https://github.com/volarjs/services/issues/83)
- **typescript:** no longer depend on `@volar/typescript`
- **prettier:** simplify plugin options [#84](https://github.com/volarjs/services/issues/84)
- **html:** remove useCustomDataProviders option that is no longer used

## [0.0.31](https://github.com/volarjs/services/compare/v0.0.30...v0.0.31) (2024-02-26)

### Features

- Upgrade to Volar 2.1
- **css, html, typescript:** consume `initialIndentLevel` option for accurate embedded code formatting [#75](https://github.com/volarjs/services/issues/75)

### Refactors

- Deprecate `volar-service-tsconfig` package
- Deprecate `volar-service-pretty-ts-errors` package
- Make all editor settings configurable [#78](https://github.com/volarjs/services/issues/78)
	- Most services now expose `documentSelector` / `*DocumentSelector` option.
	- Services with formatting capabilities now expose the `isFormattingEnabled` option.
	- **css:** no longer has built-in support for `postcss` language. If necessary, you can configure `scssDocumentSelector: ['scss', 'postcss']` option.
	- **html:** if you need to update custom data, now you should implement the `onDidChangeCustomData` option instead of inject `'html/updateCustomData'` key.

### Bug Fixes

- **html:** reference resolving inconsistent with VSCode
- **html:** script block formatting inconsistent with VSCode
- **css, html, json, yaml:** respect `ClientCapabilities.textDocument.foldingRange` option
- **typescript:** semantic tokens return redundant invalid results

## [0.0.30](https://github.com/volarjs/services/compare/v0.0.29...v0.0.30) (2024-02-13)

### Bug Fixes

- **typescript:** `validate.enable` config not working for semantic check

## [0.0.29](https://github.com/volarjs/services/compare/v0.0.28...v0.0.29) (2024-02-10)

### Bug Fixes

- **html:** `autoClosingTags` not working at first line

## [0.0.28](https://github.com/volarjs/services/compare/v0.0.27...v0.0.28) (2024-02-05)

### Features

- **typescript:** support for extra scripts [#74](https://github.com/volarjs/services/issues/74)

### Bug Fixes

- **typescript:** only process `getScript()` result in semantic features [#73](https://github.com/volarjs/services/issues/73)

## [0.0.27](https://github.com/volarjs/services/compare/v0.0.17...v0.0.27) (2024-01-21)

### Features

- Upgrade to Volar 2.0
- **typescript:** consume `ReferenceContext` [#65](https://github.com/volarjs/services/issues/65)
- **markdown:** support user defined diagnostic options [#67](https://github.com/volarjs/services/issues/67)
- **prettier:** add `getPrettier` option [#68](https://github.com/volarjs/services/issues/68)
- **markdown:** add markdown trigger characters [#70](https://github.com/volarjs/services/issues/70)
- **markdown:** implement definitions for markdown [#71](https://github.com/volarjs/services/issues/71)

### Bug Fixes

- **typescript:** fix `*.suggest.enabled`, `*.validate.enable` config options not working (https://github.com/volarjs/services/commit/6f13b47fc01e9999f6fa46023f80225957f421f8)

### Breaking Changes

- `volar-service-eslint`, `volar-service-tslint` has been deprecated [#72](https://github.com/volarjs/services/issues/72)
