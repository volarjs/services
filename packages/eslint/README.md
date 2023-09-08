# volar-service-eslint

Volar plugin for [ESLint](https://eslint.org/).

Use ESLint with Volar language server to have better performance and accuracy.

Please note that you should disable ESLint VSCode Extension when use this plugin.

Example: https://github.com/DrJume/vue-volar-eslint

## Installation

```sh
npm install volar-service-eslint
```

## Usage

`volar.config.js`

```js
const baseConfig = require('./.eslintrc.cjs'); // load your project eslint config

module.exports = {
	services: [
		require('volar-service-eslint').create(program => ({
			...baseConfig,
			ignorePatterns: ['**/*.vue.*'], // ignore virtual files: *.vue.ts, *.vue.html, *.vue.css
			parserOptions: {
				...baseConfig.parserOptions,
				programs: [program], // replace eslint typescript program
			},
		})),
	],
};
```

## License

[MIT](LICENSE) © [Johnson Chu](https://github.com/johnsoncodehk)
