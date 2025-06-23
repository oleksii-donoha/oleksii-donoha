package aws

import (
	"context"
	"errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"log/slog"
)

type SecretApi interface {
	GetSecretValue(ctx context.Context, params *secretsmanager.GetSecretValueInput, optFns ...func(*secretsmanager.Options)) (*secretsmanager.GetSecretValueOutput, error)
}

type SSMApi interface {
	GetParameter(ctx context.Context, params *ssm.GetParameterInput, optFns ...func(*ssm.Options)) (*ssm.GetParameterOutput, error)
}

func getSecretValue(ctx context.Context, api SecretApi, secretArn string) (*secretsmanager.GetSecretValueOutput, error) {
	out, err := api.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: &secretArn,
	})
	if err != nil {
		slog.ErrorContext(ctx, "Cannot retrieve the secret value")
		return nil, err
	}
	return out, nil
}

func GetSecretString(ctx context.Context, api SecretApi, secretArn string) ([]byte, error) {
	secret, err := getSecretValue(ctx, api, secretArn)
	if err != nil {
		return []byte{}, err
	}
	if secret.SecretString == nil {
		msg := "Secret string is absent in the secret"
		slog.ErrorContext(ctx, msg)
		return []byte{}, errors.New(msg)
	}
	return []byte(*secret.SecretString), nil
}

func GetSecretBinary(ctx context.Context, api SecretApi, secretArn string) ([]byte, error) {
	secret, err := getSecretValue(ctx, api, secretArn)
	if err != nil {
		return []byte{}, err
	}
	if len(secret.SecretBinary) == 0 {
		msg := "Secret binary is absent in the secret"
		slog.ErrorContext(ctx, msg)
		return []byte{}, errors.New(msg)
	}
	return secret.SecretBinary, nil
}

func getSSMParamValue(ctx context.Context, api SSMApi, paramName string) (*ssm.GetParameterOutput, error) {
	out, err := api.GetParameter(ctx, &ssm.GetParameterInput{Name: &paramName, WithDecryption: aws.Bool(true)})
	if err != nil {
		slog.ErrorContext(ctx, "Cannot retrieve the SSM param value")
		return nil, err
	}
	return out, nil
}

func GetSSMParam(ctx context.Context, api SSMApi, paramName string) ([]byte, error) {
	param, err := getSSMParamValue(ctx, api, paramName)
	if err != nil {
		return []byte{}, err
	}
	if param.Parameter.Value == nil {
		msg := "SSM param value is missing"
		slog.ErrorContext(ctx, msg)
		return []byte{}, errors.New(msg)
	}
	return []byte(*param.Parameter.Value), nil
}
