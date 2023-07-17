# volar-service-tslint

Volar plugin for [TSLint](https://palantir.github.io/tslint/).

## Usage

`package.json`

```json
{
	"devDependencies": {
		"volar-service-tslint": "latest",
		"tslint": "latest"
	}
}
```

`volar.config.js`

```js
module.exports = {

	services: [

		require('volar-service-tslint').default([

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
