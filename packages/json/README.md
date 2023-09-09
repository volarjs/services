# volar-service-json

Volar plugin for [`vscode-json-languageservice`](https://github.com/microsoft/vscode-json-languageservice).

## Installation

```sh
npm install volar-service-json
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-json').create(),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
