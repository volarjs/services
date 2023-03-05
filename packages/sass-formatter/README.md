# @volar-plugins/sass-formatter

Volar plugin for [Sass Formatter](https://sass-formatter.syler.de/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/sass-formatter": "latest"
  }
}
```

`volar.config.js`

```js
const sassFormatter = require('@volar-plugins/sass-formatter').default;

module.exports = {
	plugins: [
		sassFormatter({}),
	],
};
```
