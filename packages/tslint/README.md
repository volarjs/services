# volar-service-tslint

Volar plugin for [TSLint](https://palantir.github.io/tslint/).

## Installation

```sh
npm install tslint volar-service-tslint
```

## Usage

`volar.config.js`

```js
module.exports = {

	services: [

		require('volar-service-tslint').create([

			new (require('tslint/lib/rules/banTsIgnoreRule').Rule)({
				ruleName: 'ban-ts-ignore',
				ruleArguments: [],
				ruleSeverity: 'warning',
			}),

			new (require('tslint/lib/rules/maxLineLengthRule').Rule)({
				ruleName: 'max-line-length',
				ruleArguments: [40],
				ruleSeverity: 'warning',
			}),
		]),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
