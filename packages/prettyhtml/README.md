# volar-service-prettyhtml

Volar plugin for [PrettyHtml](https://prettyhtml.netlify.app/).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "volar-service-prettyhtml": "latest"
  }
}
```

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-prettyhtml').default({ printWidth: 100 }),
	],
};
```
