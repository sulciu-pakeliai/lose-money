package gorules

import "github.com/quasilyte/go-ruleguard/dsl"

func demoSlotJoinRule(m dsl.Matcher) {
	m.Match(`strings.Join($x, ",")`).
		Where(m["x"].Text.Matches(`reels\[:\]`)).
		Report("custom demo rule: avoid strings.Join(reels[:], \",\")")
}
