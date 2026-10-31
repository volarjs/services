import { SpanMapKind, type SpanMapSegment } from '@volar/language-service';
import type { ParseResult } from 'muggle-pug';

/** The HTML of `pieces`, and the mappings from it to `pugCode`. */
export function buildHTML(pugCode: string, pieces: ParseResult['pieces']) {
	let html = '';
	const mappings: SpanMapSegment[] = [];
	for (const piece of pieces) {
		if (typeof piece === 'string') {
			html += piece;
			continue;
		}
		const { start, end } = piece;
		const text = piece.text ?? pugCode.slice(start, end);
		mappings.push({
			virtualStart: html.length,
			virtualEnd: html.length + text.length,
			originalStart: start,
			originalEnd: end,
			kind: SpanMapKind.Verbatim,
			features: 0,
		});
		html += text;
	}
	return { html, mappings };
}
