import { describe, expect, test } from "bun:test";
import { transform } from "./transform";

describe("transform", () => {
	const cases: Array<{
		changes: number;
		in: string;
		name: string;
		out: string;
	}> = [
		{
			name: "rybbit: event only",
			in: '<a data-rybbit-event="signup_clicked">Sign up</a>',
			out: '<a data-track="signup_clicked">Sign up</a>',
			changes: 1,
		},
		{
			name: "rybbit: event + prop",
			in: '<a data-rybbit-event="signup_clicked" data-rybbit-prop-source="hero">Sign up</a>',
			out: '<a data-track="signup_clicked" data-source="hero">Sign up</a>',
			changes: 2,
		},
		{
			name: "umami: event + prop (collision-prone prefix)",
			in: '<button data-umami-event="add_to_cart" data-umami-event-product="t-shirt" data-umami-event-price="29.99">Add</button>',
			out: '<button data-track="add_to_cart" data-product="t-shirt" data-price="29.99">Add</button>',
			changes: 3,
		},
		{
			name: "pirsch: event + meta + duration",
			in: '<a data-pirsch-event="checkout" data-pirsch-meta-plan="pro" data-pirsch-duration="123">Buy</a>',
			out: '<a data-track="checkout" data-plan="pro" data-duration="123">Buy</a>',
			changes: 3,
		},
		{
			name: "no-op: already on data-track",
			in: '<a data-track="signup_clicked">Sign up</a>',
			out: '<a data-track="signup_clicked">Sign up</a>',
			changes: 0,
		},
		{
			name: "no-op: unrelated data attrs preserved",
			in: '<a data-testid="cta" data-foo="bar">Hi</a>',
			out: '<a data-testid="cta" data-foo="bar">Hi</a>',
			changes: 0,
		},
		{
			name: "mixed dialects in same file",
			in: '<a data-rybbit-event="x"></a><a data-umami-event="y"></a><a data-pirsch-event="z"></a>',
			out: '<a data-track="x"></a><a data-track="y"></a><a data-track="z"></a>',
			changes: 3,
		},
		{
			name: "JSX with single quotes",
			in: "<button data-rybbit-event='start_free' data-rybbit-prop-placement='nav'>",
			out: "<button data-track='start_free' data-placement='nav'>",
			changes: 2,
		},
		{
			name: "umami: bare event vs event-suffixed prop are not confused",
			in: '<a data-umami-event="x" data-umami-event-foo="1">',
			out: '<a data-track="x" data-foo="1">',
			changes: 2,
		},
		{
			name: "pirsch: duration handled before generic meta",
			in: '<a data-pirsch-duration="500">',
			out: '<a data-duration="500">',
			changes: 1,
		},
		{
			name: "edge: empty input",
			in: "",
			out: "",
			changes: 0,
		},
		{
			name: "edge: whitespace only",
			in: "   \n\t  ",
			out: "   \n\t  ",
			changes: 0,
		},
		{
			name: "edge: input with no matches at all",
			in: "<div><p>Hello world</p></div>",
			out: "<div><p>Hello world</p></div>",
			changes: 0,
		},
		{
			name: "edge: same vendor attr appears multiple times across many elements",
			in: Array.from(
				{ length: 50 },
				(_, i) => `<a data-rybbit-event="evt_${i}"></a>`
			).join(""),
			out: Array.from(
				{ length: 50 },
				(_, i) => `<a data-track="evt_${i}"></a>`
			).join(""),
			changes: 50,
		},
		{
			name: "edge: attribute value contains the vendor name as text",
			in: '<a data-rybbit-event="rybbit-vs-umami">vs</a>',
			out: '<a data-track="rybbit-vs-umami">vs</a>',
			changes: 1,
		},
		{
			name: "edge: attribute value contains another vendor's name",
			in: '<a data-rybbit-event="data-umami-event">x</a>',
			out: '<a data-track="data-umami-event">x</a>',
			changes: 1,
		},
		{
			name: "edge: vendor pattern inside HTML comment is rewritten (acceptable)",
			in: '<!-- data-rybbit-event="ignore_me" --><a data-rybbit-event="real">x</a>',
			out: '<!-- data-track="ignore_me" --><a data-track="real">x</a>',
			changes: 2,
		},
		{
			name: "edge: vendor pattern inside string literal is rewritten (acceptable)",
			in: 'const html = `<a data-rybbit-event="x">y</a>`;',
			out: 'const html = `<a data-track="x">y</a>`;',
			changes: 1,
		},
		{
			name: "edge: multi-line element with attrs on separate lines",
			in: '<a\n  data-rybbit-event="signup"\n  data-rybbit-prop-source="hero"\n>Sign up</a>',
			out: '<a\n  data-track="signup"\n  data-source="hero"\n>Sign up</a>',
			changes: 2,
		},
		{
			name: "edge: tab indentation between attributes",
			in: '<a\tdata-rybbit-event="x"\tdata-rybbit-prop-y="1">',
			out: '<a\tdata-track="x"\tdata-source-not-tab=1>'.replace(
				"data-source-not-tab=1",
				'data-y="1"'
			),
			changes: 2,
		},
		{
			name: "edge: rybbit-event-foo is NOT a valid prop format and is left untouched",
			in: '<a data-rybbit-event-foo="1">',
			out: '<a data-rybbit-event-foo="1">',
			changes: 0,
		},
		{
			name: "edge: pirsch-event-foo is NOT a valid prop format and is left untouched",
			in: '<a data-pirsch-event-foo="1">',
			out: '<a data-pirsch-event-foo="1">',
			changes: 0,
		},
		{
			name: "edge: umami-prop-foo is NOT a valid umami prop format (umami uses event- prefix)",
			in: '<a data-umami-prop-foo="1">',
			out: '<a data-umami-prop-foo="1">',
			changes: 0,
		},
		{
			name: "edge: rybbit-meta-foo is NOT a valid rybbit prop format (rybbit uses prop- prefix)",
			in: '<a data-rybbit-meta-foo="1">',
			out: '<a data-rybbit-meta-foo="1">',
			changes: 0,
		},
		{
			name: "edge: pirsch-prop-foo is NOT a valid pirsch prop format (pirsch uses meta- prefix)",
			in: '<a data-pirsch-prop-foo="1">',
			out: '<a data-pirsch-prop-foo="1">',
			changes: 0,
		},
		{
			name: "edge: vendor pattern inside <script> block is still rewritten (string-based, acceptable)",
			in: '<script>const x = `<a data-rybbit-event="x">a</a>`;</script>',
			out: '<script>const x = `<a data-track="x">a</a>`;</script>',
			changes: 1,
		},
		{
			name: "edge: empty value attribute is rewritten",
			in: '<a data-rybbit-event="">',
			out: '<a data-track="">',
			changes: 1,
		},
		{
			name: "edge: numeric prop value preserved",
			in: '<a data-rybbit-event="x" data-rybbit-prop-count="42">',
			out: '<a data-track="x" data-count="42">',
			changes: 2,
		},
		{
			name: "edge: kebab-cased prop key preserved (no SDK-side conversion in the codemod)",
			in: '<a data-rybbit-event="x" data-rybbit-prop-multi-word-key="value">',
			out: '<a data-track="x" data-multi-word-key="value">',
			changes: 2,
		},
		{
			name: "edge: same prop appears twice on different elements",
			in: '<a data-rybbit-prop-x="1"></a><b data-rybbit-prop-x="2"></b>',
			out: '<a data-x="1"></a><b data-x="2"></b>',
			changes: 2,
		},
		{
			name: "edge: rybbit prop without a corresponding event still rewritten (codemod is mechanical)",
			in: '<a data-rybbit-prop-orphan="1">',
			out: '<a data-orphan="1">',
			changes: 1,
		},
		{
			name: "edge: extra whitespace around equals sign — codemod is conservative and does NOT match",
			in: '<a data-rybbit-event = "x">',
			out: '<a data-rybbit-event = "x">',
			changes: 0,
		},
		{
			name: "edge: vendor pattern that's a substring (e.g. data-rybbit-eventually) is NOT matched",
			in: '<a data-rybbit-eventually="x">',
			out: '<a data-rybbit-eventually="x">',
			changes: 0,
		},
		{
			name: "edge: hyphenated prefix (data-not-rybbit-event) is NOT matched because codemod requires literal data-rybbit-event substring",
			in: '<a data-not-rybbit-event="x">',
			out: '<a data-not-rybbit-event="x">',
			changes: 0,
		},
		{
			name: "edge: complex JSX block with multiple Tracking dialects on same element",
			in: '<a\n  href="/x"\n  data-rybbit-event="signup"\n  data-pirsch-event="signup"\n  data-umami-event="signup"\n>',
			out: '<a\n  href="/x"\n  data-track="signup"\n  data-track="signup"\n  data-track="signup"\n>',
			changes: 3,
		},
		{
			name: "edge: vendor in href attribute is NOT confused with vendor in attribute name",
			in: '<a href="https://docs.rybbit.com/data-rybbit-event">link</a>',
			out: '<a href="https://docs.rybbit.com/data-rybbit-event">link</a>',
			changes: 0,
		},
		{
			name: "edge: realistic React component with mixed attribute styles",
			in: '<button\n  className="cta"\n  onClick={handle}\n  data-rybbit-event="signup_clicked"\n  data-rybbit-prop-source="hero"\n>\n  Sign up\n</button>',
			out: '<button\n  className="cta"\n  onClick={handle}\n  data-track="signup_clicked"\n  data-source="hero"\n>\n  Sign up\n</button>',
			changes: 2,
		},
		{
			name: "edge: large mixed-vendor file (10 of each)",
			in:
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-rybbit-event="r${i}"></a>`
				).join("") +
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-umami-event="u${i}"></a>`
				).join("") +
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-pirsch-event="p${i}"></a>`
				).join(""),
			out:
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-track="r${i}"></a>`
				).join("") +
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-track="u${i}"></a>`
				).join("") +
				Array.from(
					{ length: 10 },
					(_, i) => `<a data-track="p${i}"></a>`
				).join(""),
			changes: 30,
		},
	];

	test.each(cases)("$name", ({ in: input, out, changes }) => {
		const result = transform(input);
		expect(result.output).toBe(out);
		expect(result.changes).toBe(changes);
	});

	test("idempotent — running twice yields no further changes", () => {
		const input =
			'<a data-rybbit-event="x" data-rybbit-prop-y="1" data-umami-event="z">';
		const first = transform(input);
		const second = transform(first.output);
		expect(second.output).toBe(first.output);
		expect(second.changes).toBe(0);
	});

	test("idempotent across mixed dialects with all property variants", () => {
		const input =
			'<a data-rybbit-event="r" data-rybbit-prop-foo="1" data-umami-event="u" data-umami-event-bar="2" data-pirsch-event="p" data-pirsch-meta-baz="3" data-pirsch-duration="100">';
		const first = transform(input);
		const second = transform(first.output);
		const third = transform(second.output);
		expect(first.output).toBe(second.output);
		expect(second.output).toBe(third.output);
		expect(third.changes).toBe(0);
	});

	test("preserves all non-vendor content byte-for-byte", () => {
		const surrounding =
			"prefix-content\n<!-- comment -->\n<style>.cls { color: red; }</style>\n";
		const trailing = "\n</body>\nsuffix-content";
		const input = `${surrounding}<a data-rybbit-event="x">y</a>${trailing}`;
		const result = transform(input);
		expect(result.output.startsWith(surrounding)).toBe(true);
		expect(result.output.endsWith(trailing)).toBe(true);
	});

	test("returns identical reference-equal pieces when no change occurs (string identity)", () => {
		const input = "<div>nothing to do</div>";
		const result = transform(input);
		expect(result.output).toBe(input);
		expect(result.changes).toBe(0);
	});

	test("count matches actual number of distinct replacements", () => {
		const input =
			'<a data-rybbit-event="a"></a><a data-rybbit-event="b"></a><a data-rybbit-event="c"></a>';
		const result = transform(input);
		expect(result.changes).toBe(3);
		const occurrences = (result.output.match(/data-track=/g) || []).length;
		expect(occurrences).toBe(3);
	});

	test("count is sum of all dialect-specific rewrites", () => {
		const input =
			'<a data-rybbit-event="r"><b data-rybbit-prop-x="1"><c data-umami-event="u"><d data-umami-event-y="2"><e data-pirsch-event="p"><f data-pirsch-meta-z="3"><g data-pirsch-duration="100">';
		const result = transform(input);
		expect(result.changes).toBe(7);
	});

	test("performance: 10k lines processed under 200ms", () => {
		const line = '<a data-rybbit-event="evt" data-rybbit-prop-source="hero">x</a>\n';
		const input = line.repeat(10_000);
		const start = performance.now();
		const result = transform(input);
		const elapsed = performance.now() - start;
		expect(result.changes).toBe(20_000);
		expect(elapsed).toBeLessThan(200);
	});
});
