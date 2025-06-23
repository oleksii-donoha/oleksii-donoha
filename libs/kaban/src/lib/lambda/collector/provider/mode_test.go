package provider

import (
	"testing"
)

func TestAllowedModes_Validate(t *testing.T) {
	t.Run("Given a RepoFilter instance with some filters", func(t *testing.T) {
		f := func(_ ...any) bool { return true }
		filterMap := map[string]Predicate{"mode1": f, "mode2": f, "mode3": f}
		filters := RepoFilter{filterMap}

		t.Run("When Validate is called with a key that exists", func(t *testing.T) {
			if !filters.Validate("mode2") {
				t.Errorf("Expected Validate to return true for 'mode2', got false")
			}
		})

		t.Run("When Validate is called with a key that does not exist", func(t *testing.T) {
			if filters.Validate("modeX") {
				t.Errorf("Expected Validate to return false for 'modeX', got true")
			}
		})

		t.Run("When Validate is called with an empty string", func(t *testing.T) {
			if filters.Validate("") {
				t.Errorf("Expected Validate to return false for empty string, got true")
			}
		})
	})

	t.Run("Given a RepoFilter instance with an empty filter list", func(t *testing.T) {
		filters := RepoFilter{map[string]Predicate{}}

		t.Run("When Validate is called with any key", func(t *testing.T) {
			if filters.Validate("anything") {
				t.Errorf("Expected Validate to return false for any key, got true")
			}
		})
	})
}
