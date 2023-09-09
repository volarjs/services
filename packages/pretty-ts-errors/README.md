# volar-service-pretty-ts-errors

Volar plugin for [pretty-ts-errors](https://github.com/yoavbls/pretty-ts-errors).

## Installation

```sh
npm install prettier volar-service-pretty-ts-errors
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-pretty-ts-errors').create(
			type => require('prettier').format(type, {
				parser: 'typescript',
				printWidth: 60,
				singleAttributePerLine: false,
				arrowParens: 'avoid',
			});
		),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
