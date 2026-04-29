package gorules

import "github.com/quasilyte/go-ruleguard/dsl"

func avoidMagicTokenLength(m dsl.Matcher) {
	m.Match(`mustRandomToken(24)`).
		Report("avoid magic token length 24; use a named constant")
}
