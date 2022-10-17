# @volar-plugins/sass-formatter

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/vue-json": "latest"
  }
}
```

`volar.config.js`

```js
const json = require('@volar-plugins/vue-json');

module.exports = {
	plugins: [
		json({ route: 'https://json.schemastore.org/prettierrc.json' }),
	],
};
```
