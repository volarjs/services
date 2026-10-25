# volar-service-css

Volar plugin for [`vscode-css-languageservice`](https://github.com/microsoft/vscode-css-languageservice).

## Installation

```sh
npm install volar-service-css
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-css').create(),
	],
};
```

## Configuration

### `<languageId>.languageService.enable`

Set to `false` to turn off all features of this service for documents of that language. Use this when a different language service handles the language, for example a dedicated Sass language server for `scss`.

```json
{
	"scss.languageService.enable": false
}
```

The check uses the document language, not the language service. When a host maps `postcss` to the SCSS language service, `postcss` documents keep their features.

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
