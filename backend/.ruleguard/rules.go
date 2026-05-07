package gorules

import "github.com/quasilyte/go-ruleguard/dsl"

func avoidMagicTokenLength(m dsl.Matcher) {
	m.Match(`mustRandomToken($n)`).
		Where(m["n"].Text.Matches(`^\d+$`)).
		Report("avoid magic token length; use a named constant")
}

func noSprintfInSQL(m dsl.Matcher) {
	m.Import("fmt")
	m.Match(
		`$_.Exec($_, fmt.Sprintf($*_), $*_)`,
		`$_.QueryRow($_, fmt.Sprintf($*_), $*_)`,
		`$_.Query($_, fmt.Sprintf($*_), $*_)`,
		`$_.Exec($_, fmt.Sprintf($*_))`,
		`$_.QueryRow($_, fmt.Sprintf($*_))`,
		`$_.Query($_, fmt.Sprintf($*_))`,
	).Report("avoid fmt.Sprintf in SQL query strings; use parameterized placeholders ($1, $2, ...) instead")
}
