# volar-service-pretty-ts-errors

Volar plugin for [pretty-ts-errors](https://github.com/yoavbls/pretty-ts-errors).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "volar-service-pretty-ts-errors": "latest",
    "prettier": "latest"
  }
}
```

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-pretty-ts-errors').default(
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
