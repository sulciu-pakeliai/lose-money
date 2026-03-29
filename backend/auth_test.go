package main

import "testing"

func TestGeneratePasswordHashAndCompare(t *testing.T) {
	t.Parallel()

	const password = "Slaptikas123!"

	hash, err := generatePasswordHash(password)
	if err != nil {
		t.Fatalf("generatePasswordHash() error = %v", err)
	}
	if hash == password || hash == "" {
		t.Fatalf("generatePasswordHash() returned invalid hash %q", hash)
	}

	ok, err := comparePasswordAndHash(password, hash)
	if err != nil {
		t.Fatalf("comparePasswordAndHash() error = %v", err)
	}
	if !ok {
		t.Fatal("comparePasswordAndHash() = false, want true")
	}

	hash, err = generatePasswordHash("NeverGonna")
	if err != nil {
		t.Fatalf("generatePasswordHash() error = %v", err)
	}

	ok, err = comparePasswordAndHash("GiveYouUp", hash)
	if err != nil {
		t.Fatalf("comparePasswordAndHash() error = %v", err)
	}
	if ok {
		t.Fatal("comparePasswordAndHash() = true, want false")
	}
}
