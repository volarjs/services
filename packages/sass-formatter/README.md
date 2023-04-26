# volar-service-sass-formatter

Volar plugin for [Sass Formatter](https://sass-formatter.syler.de/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "volar-service-sass-formatter": "latest"
  }
}
```

`volar.config.js`

```js
const sassFormatter = require('volar-service-sass-formatter').default;

module.exports = {
	plugins: [
		sassFormatter({}),
	],
};
```
