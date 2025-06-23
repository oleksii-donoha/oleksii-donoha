package provider

import (
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"slices"
)

type IMode interface {
	Validate(key string) bool
	List() []string
}

type RepoFilter struct {
	FilterMap map[string]Predicate
}

func (rf *RepoFilter) Validate(key string) bool {
	return slices.Contains(rf.List(), key)
}

func (rf *RepoFilter) List() []string {
	return slices.Collect(maps.Keys(rf.FilterMap))
}

func (rf *RepoFilter) GetPredicate(key string) (Predicate, error) {
	if !rf.Validate(key) {
		msg := fmt.Sprintf("no such key exists in the filter map: %s", key)
		slog.Error(msg)
		return nil, errors.New(msg)
	}
	return rf.FilterMap[key], nil
}
