# @volar-plugins/prettier

[Volar](https://github.com/johnsoncodehk/volar) plugin for [prettier](https://prettier.io/).

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
const prettierHtml = require('@volar-plugins/prettier-html').default;

module.exports = {
	plugins: [
		prettierHtml({ printWidth: 100 }),
	],
};
```
