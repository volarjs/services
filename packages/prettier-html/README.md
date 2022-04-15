# @volar-plugins/prettier-html

[Volar](https://github.com/johnsoncodehk/volar) plugin for [prettier-html](https://prettyhtml.netlify.app/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/prettier-html": "latest"
  }
}
```

`volar.config.js`

```js
const prettierHtml = require('@volar-plugins/prettier-html');

module.exports = {
	plugins: [
		prettierHtml({ printWidth: 100 }),
	],
};
```
