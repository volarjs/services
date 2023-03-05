# @volar-plugins/eslint

Volar plugin for [ESLint](https://eslint.org/).

Use ESLint with Volar language server to have better performance and accuracy.

Please note that you should disable ESLint VSCode Extension when use this plugin.

Example: https://github.com/DrJume/vue-volar-eslint

## Usage

`package.json`

```json
{
	"devDependencies": {
		"@volar-plugins/eslint": "latest",
		"eslint": "latest"
	}
}
```

`volar.config.js`

```js
const baseConfig = require('./.eslintrc.cjs'); // load your project eslint config

module.exports = {

	plugins: [

		require('@volar-plugins/eslint').default(program => ({
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
