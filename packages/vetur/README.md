# volar-service-vetur

Volar plugin for [VLS](https://www.npmjs.com/package/vls).

With this plugin you can use this Vetur base features in Volar:

- [Customizable Scaffold Snippets](https://vuejs.github.io/vetur/guide/snippet.html#customizable-scaffold-snippets)
- [Component Data](https://vuejs.github.io/vetur/guide/component-data.html#supported-frameworks)

## Installation

```sh
npm install volar-service-vetur
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-vetur').create(),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
