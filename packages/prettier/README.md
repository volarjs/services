# @volar-plugins/prettier

[Volar](https://github.com/johnsoncodehk/volar) plugin for [prettier](https://prettier.io/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/prettier": "latest"
  }
}
```

`volar.config.js`

```js
/** @type {import('@volar-plugins/prettier')} */
const { volarPrettierPlugin } = require('@volar-plugins/prettier');

module.exports = {
	plugins: [
		volarPrettierPlugin({
			languages: ['html', 'css', 'scss', 'typescript', 'javascript'],
			html: {
				breakContentsFromTags: true,
			},
			useVscodeIndentation: true,
		}),
	],
};
```
