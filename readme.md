# volar-plugins

> Extra plugins for [Volar](https://github.com/johnsoncodehk/volar).

## Usage

prettier-html:

```json
// package.json
{
  "devDependencies": {
    "@volar-plugins/prettier-html": "latest"
  }
}
```

```js
// vetur.config.js
module.exports = {
    plugins: [
        require('@volar-plugins/prettier-html').default({ printWidth: 100 }),
    ],
};
```

prettier:

```json
// package.json
{
  "devDependencies": {
    "@volar-plugins/prettier": "latest"
  }
}
```

```js
// vetur.config.js
module.exports = {
    plugins: [
        require('@volar-plugins/prettier').default({ languages: ['html', 'css', 'scss', 'less'] }),
    ],
};
```
