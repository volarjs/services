# volar-service-prettyhtml

Volar plugin for [PrettyHtml](https://prettyhtml.netlify.app/).

## Installation

```sh
npm install volar-service-prettyhtml
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-prettyhtml').create({ printWidth: 100 }),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
