# @volar-plugins/prettyhtml

[Volar](https://github.com/johnsoncodehk/volar) plugin for [PrettyHtml](https://prettyhtml.netlify.app/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/prettyhtml": "latest"
  }
}
```

`volar.config.js`

```js
const prettierHtml = require('@volar-plugins/prettyhtml');

module.exports = {
	plugins: [
		prettierHtml({ printWidth: 100 }),
	],
};
```
