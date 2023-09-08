# volar-service-markdown

Volar plugin for [`vscode-markdown-languageservice`](https://github.com/microsoft/vscode-markdown-languageservice).

## Installation

```sh
npm install volar-service-markdown
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-markdown').create(),
	],
};
```

## License

[MIT](LICENSE) © [Remco Haszing](https://github.com/remcohaszing)
