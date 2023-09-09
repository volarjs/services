# volar-service-tsconfig

Volar plugin for [`tsconfig.json`](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html).

## Installation

```sh
npm install volar-service-tsconfig
```

## Usage

`volar.config.js`

```js
module.exports = {
	services: [
		require('volar-service-tsconfig').create(),
	],
};
```


## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
