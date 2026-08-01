/** Ledger path / identity safety — reject traversal and junk. */
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export function assertSafeId(id: string, label: string): string {
	if (!ID_RE.test(id)) {
		throw new Error(
			`Invalid ${label}: must match ${ID_RE} (got ${JSON.stringify(id.slice(0, 80))})`,
		);
	}
	return id;
}
