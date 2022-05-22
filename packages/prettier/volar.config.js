/** @type {import('./src')} */
const { volarPrettierPlugin } = require('./out');

module.exports = {
	plugins: [
		volarPrettierPlugin({
			html: {
				// breakContentsFromTags: true,
			},
			// useVscodeIndentation: true,
		}),
	],
};
