# @volar-plugins/vetur

[Volar](https://github.com/johnsoncodehk/volar) plugin for [VLS](https://www.npmjs.com/package/vls).

## Usage

`package.json`

```json
{
  "devDependencies": {
    "@volar-plugins/vetur": "latest"
  }
}
```

`volar.config.js`

```js
const vetur = require('@volar-plugins/vetur');

module.exports = {
	plugins: [
		vetur(),
	],
};
```
