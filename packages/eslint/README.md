# @volar-plugins/eslint

[Volar](https://github.com/johnsoncodehk/volar) plugin for [ESLint](https://eslint.org/).

## Usage

`package.json`

```json
{
	"devDependencies": {
		"eslint": "latest"
	}
}
```

`volar.config.js`

```js
const baseConfig = require('./.eslintrc.cjs'); // load your project eslint config

module.exports = {

	plugins: [

		require('@volar-plugins/eslint')(program => ({
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
