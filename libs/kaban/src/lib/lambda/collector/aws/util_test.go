package aws

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"

	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/aws-sdk-go-v2/service/ssm/types"
)

// --- Mocks ---

type mockSecretApi struct {
	output *secretsmanager.GetSecretValueOutput
	err    error
}

func (m *mockSecretApi) GetSecretValue(ctx context.Context, params *secretsmanager.GetSecretValueInput, optFns ...func(*secretsmanager.Options)) (*secretsmanager.GetSecretValueOutput, error) {
	return m.output, m.err
}

type mockSSMApi struct {
	output *ssm.GetParameterOutput
	err    error
}

func (m *mockSSMApi) GetParameter(ctx context.Context, params *ssm.GetParameterInput, optFns ...func(*ssm.Options)) (*ssm.GetParameterOutput, error) {
	return m.output, m.err
}

// --- Tests ---

func Test_getSecretValue(t *testing.T) {
	ctx := context.Background()
	t.Run("success", func(t *testing.T) {
		expected := &secretsmanager.GetSecretValueOutput{SecretString: aws.String("value")}
		api := &mockSecretApi{output: expected}
		out, err := getSecretValue(ctx, api, "arn:aws:secretsmanager:secret")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if out != expected {
			t.Errorf("expected output: %v, got: %v", expected, out)
		}
	})

	t.Run("error from api", func(t *testing.T) {
		api := &mockSecretApi{err: errors.New("api error")}
		out, err := getSecretValue(ctx, api, "arn:aws:secretsmanager:secret")
		if err == nil {
			t.Fatalf("expected error, got none")
		}
		if out != nil {
			t.Errorf("expected nil output, got: %v", out)
		}
	})
}

func Test_GetSecretString(t *testing.T) {
	ctx := context.Background()
	t.Run("success", func(t *testing.T) {
		val := "secret-string"
		api := &mockSecretApi{output: &secretsmanager.GetSecretValueOutput{SecretString: &val}}
		out, err := GetSecretString(ctx, api, "arn")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if slices.Compare(out, []byte(val)) != 0 {
			t.Errorf("expected %q, got %q", val, out)
		}
	})

	t.Run("secret string missing", func(t *testing.T) {
		api := &mockSecretApi{output: &secretsmanager.GetSecretValueOutput{}}
		_, err := GetSecretString(ctx, api, "arn")
		if err == nil || err.Error() != "Secret string is absent in the secret" {
			t.Errorf("expected error about missing secret string, got: %v", err)
		}
	})

	t.Run("api error", func(t *testing.T) {
		api := &mockSecretApi{err: errors.New("api error")}
		_, err := GetSecretString(ctx, api, "arn")
		if err == nil {
			t.Errorf("expected error, got nil")
		}
	})
}

func Test_GetSecretBinary(t *testing.T) {
	ctx := context.Background()
	t.Run("success", func(t *testing.T) {
		data := []byte{1, 2, 3}
		api := &mockSecretApi{output: &secretsmanager.GetSecretValueOutput{SecretBinary: data}}
		out, err := GetSecretBinary(ctx, api, "arn")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if string(out) != string(data) {
			t.Errorf("expected %v, got %v", data, out)
		}
	})

	t.Run("secret binary missing", func(t *testing.T) {
		api := &mockSecretApi{output: &secretsmanager.GetSecretValueOutput{}}
		out, err := GetSecretBinary(ctx, api, "arn")
		if err == nil || err.Error() != "Secret binary is absent in the secret" {
			t.Errorf("expected error about missing secret binary, got: %v", err)
		}
		if len(out) != 0 {
			t.Errorf("expected empty output, got: %v", out)
		}
	})

	t.Run("api error", func(t *testing.T) {
		api := &mockSecretApi{err: errors.New("api error")}
		out, err := GetSecretBinary(ctx, api, "arn")
		if err == nil {
			t.Errorf("expected error, got nil")
		}
		if len(out) != 0 {
			t.Errorf("expected empty output, got: %v", out)
		}
	})
}

func Test_getSSMParamValue(t *testing.T) {
	ctx := context.Background()
	t.Run("success", func(t *testing.T) {
		expected := &ssm.GetParameterOutput{Parameter: &types.Parameter{Value: aws.String("param-value")}}
		api := &mockSSMApi{output: expected}
		out, err := getSSMParamValue(ctx, api, "param")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if out != expected {
			t.Errorf("expected %v, got %v", expected, out)
		}
	})

	t.Run("api error", func(t *testing.T) {
		api := &mockSSMApi{err: errors.New("api error")}
		out, err := getSSMParamValue(ctx, api, "param")
		if err == nil {
			t.Fatalf("expected error, got nil")
		}
		if out != nil {
			t.Errorf("expected nil output, got: %v", out)
		}
	})
}

func Test_GetSSMParam(t *testing.T) {
	ctx := context.Background()
	t.Run("success", func(t *testing.T) {
		val := "param-value"
		api := &mockSSMApi{output: &ssm.GetParameterOutput{Parameter: &types.Parameter{Value: &val}}}
		out, err := GetSSMParam(ctx, api, "param")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if slices.Compare(out, []byte(val)) != 0 {
			t.Errorf("expected %q, got %q", val, out)
		}
	})

	t.Run("missing parameter value", func(t *testing.T) {
		api := &mockSSMApi{output: &ssm.GetParameterOutput{Parameter: &types.Parameter{}}}
		_, err := GetSSMParam(ctx, api, "param")
		if err == nil || err.Error() != "SSM param value is missing" {
			t.Errorf("expected specific error about missing value, got: %v", err)
		}
	})

	t.Run("api error", func(t *testing.T) {
		api := &mockSSMApi{err: errors.New("api error")}
		_, err := GetSSMParam(ctx, api, "param")
		if err == nil {
			t.Errorf("expected error, got nil")
		}
	})
}
