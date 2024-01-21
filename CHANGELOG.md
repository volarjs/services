# Changelog

## [0.0.27](https://github.com/volarjs/volar.js/compare/v0.0.17...v0.0.27) (2024-01-21)

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
