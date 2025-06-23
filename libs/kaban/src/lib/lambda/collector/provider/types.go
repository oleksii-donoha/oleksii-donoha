package provider

import "context"

type Predicate func(args ...any) bool

type ListRepositoriesOpts struct {
	Owner      string
	FilterName string
}

type Provider interface {
	ListRepositories(ctx context.Context, opts *ListRepositoriesOpts) ([]any, error)
}
