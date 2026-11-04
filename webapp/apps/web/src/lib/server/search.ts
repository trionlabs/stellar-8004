// PostgreSQL's English stopword list (Snowball english.stop). plainto_tsquery dropped these,
// so a query made only of them matched nothing; FTS5 must behave the same.
const STOPWORDS = new Set(
	(
		'i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her ' +
		'hers herself it its itself they them their theirs themselves what which who whom this that these ' +
		'those am is are was were be been being have has had having do does did doing a an the and but if ' +
		'or because as until while of at by for with about against between into through during before after ' +
		'above below to from up down in out on off over under again further then once here there when where ' +
		'why how all any both each few more most other some such no nor not only own same so than too very s ' +
		't can will just don should now'
	).split(' ')
);
const MAX_TERMS = 16;

/**
 * Turns free text into an FTS5 MATCH expression with plainto_tsquery semantics: every word
 * must match, stopwords are ignored, and nothing the user types is read as FTS5 syntax
 * (each term is a quoted string). Returns null when no searchable word is left; callers
 * then return no results, as Postgres did.
 */
export function ftsMatch(query: string): string | null {
	const terms = [
		...new Set(
			// No lowercasing here: FTS5 runs query terms through the same tokenizer as the
			// documents, so case folding stays consistent. JavaScript would turn "İ" into
			// "i" + U+0307, which the tokenizer never produces. Combining marks stay inside words.
			query
				.slice(0, 500)
				.normalize('NFC')
				.split(/[^\p{L}\p{N}\p{M}]+/u)
				.filter((term) => term !== '' && !STOPWORDS.has(term.toLowerCase()))
		)
	].slice(0, MAX_TERMS);
	return terms.length === 0 ? null : terms.map((term) => `"${term}"`).join(' AND ');
}
