package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"strconv"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/service/ssm"

	// "github.com/aws/aws-lambda-go/events"
	"context"
	"os"

	"github.com/oleksii-donoha/oleksii-donoha/kaban/collector/m/v2/aws"
	"github.com/oleksii-donoha/oleksii-donoha/kaban/collector/m/v2/provider"
	"github.com/oleksii-donoha/oleksii-donoha/kaban/collector/m/v2/provider/github"
)

type TriggerRequest struct {
	Mode string `json:"mode"`
}

var mainCtx context.Context = context.Background()

func handler(ctx context.Context, event TriggerRequest) ([]byte, error) {
	ctx, cancel := context.WithCancel(mainCtx)
	defer cancel()
	ssmClient := ssm.New(ssm.Options{})
	if ssmClient == nil {
		msg := "Failed to initialize SSM client"
		slog.Error(msg)
		return []byte{}, errors.New(msg)
	}
	key, err := aws.GetSSMParam(ctx, ssmClient, os.Getenv("APP_KEY_SSM_PARAM_NAME"))
	if err != nil {
		return []byte{}, err
	}
	instId, err := strconv.Atoi(os.Getenv("INSTALLATION_ID"))
	if err != nil {
		msg := "Failed to get installation ID from environment"
		err := errors.Join(err, errors.New(msg))
		slog.Error(err.Error())
		return []byte{}, err
	}
	appId, err := strconv.Atoi(os.Getenv("APP_ID"))
	if err != nil {
		msg := "Failed to get app ID from environment"
		err := errors.Join(err, errors.New(msg))
		slog.Error(err.Error())
		return []byte{}, err
	}
	prov, err := github.New(ctx, event.Mode, int64(appId), int64(instId), key)
	if err != nil {
		return []byte{}, err
	}
	repos, err := prov.ListRepositories(ctx, &provider.ListRepositoriesOpts{
		Owner:      os.Getenv("OWNER"),
		FilterName: github.FilterAll,
	})
	if err != nil {
		return []byte{}, err
	}
	out, err := json.Marshal(provider.ListRepositoriesResult{
		Repos: repos,
	})
	if err != nil {
		msg := "Could not marshall the response"
		err := errors.Join(err, errors.New(msg))
		slog.Error(err.Error())
		return []byte{}, nil
	}
	return out, nil
}

func main() {
	// Make the handler available for Remote Procedure Call by AWS Lambda
	lambda.Start(handler)
}
