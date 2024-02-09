# Changelog

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
