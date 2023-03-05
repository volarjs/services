# @volar-plugins/prettyhtml

Volar plugin for [PrettyHtml](https://prettyhtml.netlify.app/).

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
module.exports = {
	plugins: [
		require('@volar-plugins/prettyhtml').default({ printWidth: 100 }),
	],
};
```
