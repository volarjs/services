# volar-service-vetur

Volar plugin for [VLS](https://www.npmjs.com/package/vls).

With this plugin you can use this Vetur base features in Volar:

- [Customizable Scaffold Snippets](https://vuejs.github.io/vetur/guide/snippet.html#customizable-scaffold-snippets)
- [Component Data](https://vuejs.github.io/vetur/guide/component-data.html#supported-frameworks)

## Usage

`package.json`

```json
{
  "devDependencies": {
    "volar-service-vetur": "latest"
  }
}
```

`volar.config.js`

```js
module.exports = {
	plugins: [
		require('volar-service-vetur').default(),
	],
};
```
