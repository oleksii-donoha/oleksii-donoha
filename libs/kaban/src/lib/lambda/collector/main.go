package main

import (
	"github.com/aws/aws-lambda-go/lambda"

	// "github.com/aws/aws-lambda-go/events"
	"context"
	"fmt"

	ghProvider "github.com/oleksii-donoha/oleksii-donoha/kaban/collector/m/v2/provider/github"
)

type TriggerRequest struct {
	Mode string `json:"mode"`
}

func handler(ctx context.Context, event TriggerRequest) (string, error) {
	if !ghProvider.Filters.Validate(event.Mode) {
		return "", fmt.Errorf("Cannot use mode '%s', allowed values are: %v", event.Mode, ghProvider.Filters.List())
	}
	return "handler λ!", nil
}

func main() {
	// Make the handler available for Remote Procedure Call by AWS Lambda
	lambda.Start(handler)
}
