package gorules

import "github.com/quasilyte/go-ruleguard/dsl"

func avoidMagicTokenLength(m dsl.Matcher) {
	m.Match(`mustRandomToken($n)`).
		Where(m["n"].Text.Matches(`^\d+$`)).
		Report("avoid magic token length; use a named constant")
}
