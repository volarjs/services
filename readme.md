# volar-plugins

> Extra plugins for [Volar](https://github.com/johnsoncodehk/volar).

## Usage

prettier-html:

```json
// package.json
{
  "devDependencies": {
    "@volar-plugins/prettier-html": "latest"
  }
}
```

```js
// vetur.config.js
module.exports = {
    plugins: [
        require('@volar-plugins/prettier-html').default({ printWidth: 100 }),
    ],
};
```

prettier:

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
			languages: ['html', 'css', 'scss', 'less', 'typescript', 'javascript'],
			html: {
				keepLongTemplates: true,
				breakContentsFromTags: true,
			},
		}),
	],
};
```
