/** @type {import('./src')} */
const { volarPrettierPlugin } = require('./out');

module.exports = {
	plugins: [
		volarPrettierPlugin({
			languages: ['html', 'css', 'scss', 'less', 'typescript', 'javascript'],
			html: {
				keepLongTemplates: true,
				breakContentsFromTags: true,
			},
		}),
	],
};
