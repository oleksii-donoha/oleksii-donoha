package github

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/bradleyfalzon/ghinstallation/v2"
	"github.com/google/go-github/v72/github"
	"github.com/oleksii-donoha/oleksii-donoha/kaban/collector/m/v2/provider"
)

const (
	FilterPrivate        = "private"
	FilterArchived       = "archived"
	FilterPublic         = "public"
	FilterAll            = "all"
	FilterAllNonArchived = "all_non_archived"

	ModeUser = "user"
	ModeOrg  = "org"
)

var isPrivate provider.Predicate = func(args ...any) bool {
	return *args[0].(github.Repository).Private
}

var isArchived provider.Predicate = func(args ...any) bool {
	return *args[0].(github.Repository).Archived
}

var Filters provider.RepoFilter = provider.RepoFilter{FilterMap: map[string]provider.Predicate{
	FilterPrivate:  isPrivate,
	FilterArchived: isArchived,
	FilterPublic: func(args ...any) bool {
		return !isPrivate(args)
	},
	FilterAll: func(args ...any) bool {
		return true
	},
	FilterAllNonArchived: func(args ...any) bool {
		return !isArchived(args)
	},
}}

type repoListFunc func(ctx context.Context, userOrOrg string, opts any) ([]*github.Repository, *github.Response, error)

type GithubProvider struct {
	// client   github.Client
	listFunc repoListFunc
	opts     any
}

func New(ctx context.Context, mode string, appID, installationID int64, keyContents []byte) (*GithubProvider, error) {
	tr := http.DefaultTransport

	itr, err := ghinstallation.New(tr, appID, installationID, keyContents)
	if err != nil {
		slog.Error("Failed to initialize the GitHub app transport")
		return nil, err
	}

	client := *github.NewClient(&http.Client{Transport: itr})
	listByOrg := func(ctx context.Context, userOrOrg string, opts any) ([]*github.Repository, *github.Response, error) {
		orgOpts, _ := opts.(*github.RepositoryListByOrgOptions)
		return client.Repositories.ListByOrg(ctx, userOrOrg, orgOpts)
	}
	listByUser := func(ctx context.Context, userOrOrg string, opts any) ([]*github.Repository, *github.Response, error) {
		userOpts, _ := opts.(*github.RepositoryListByUserOptions)
		return client.Repositories.ListByUser(ctx, userOrOrg, userOpts)
	}
	var listFunc repoListFunc
	var listOpts any = &github.RepositoryListByOrgOptions{} 
	switch mode {
	case ModeOrg:
		listFunc = listByOrg
	case ModeUser:
		listFunc = listByUser
	default:
		msg := fmt.Sprintf("Unknown provider mode %s, possible values: %v", mode, []string{ModeOrg, ModeUser})
		slog.Error(msg)
		return nil, errors.New(msg)
	}
	return &GithubProvider{
		listFunc: listFunc,
		opts:     listOpts,
	}, nil
}

func (gh *GithubProvider) ListRepositories(ctx context.Context, opts *provider.ListRepositoriesOpts) ([]any, error) {
	var allRepos []any
	page := 1
	for {
		switch o := gh.opts.(type) {
		case *github.RepositoryListByOrgOptions:
			o.Page = page
		case *github.RepositoryListByUserOptions:
			o.Page = page
		}
		repos, resp, err := gh.listFunc(ctx, opts.Owner, gh.opts)
		if err != nil {
			return nil, err
		}
		predicate, err := Filters.GetPredicate(opts.FilterName)
		if err != nil {
			return nil, err
		}
		for _, r := range repos {
			if predicate(r) {
				allRepos = append(allRepos, r)
			}
		}
		if resp.NextPage == 0 {
			break
		}
		page = resp.NextPage
	}
	return allRepos, nil
}
