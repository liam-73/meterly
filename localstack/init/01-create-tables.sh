#!/usr/bin/env bash
set -euo pipefail

echo "[localstack:init] Creating DynamoDB tables..."

awslocal dynamodb create-table \
  --table-name tenants \
  --attribute-definitions AttributeName=tenantId,AttributeType=S \
  --key-schema AttributeName=tenantId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name apiKeys \
  --attribute-definitions AttributeName=hashedKey,AttributeType=S \
  --key-schema AttributeName=hashedKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name usage \
  --attribute-definitions AttributeName=tenantId,AttributeType=S \
  --key-schema AttributeName=tenantId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name invoices \
  --attribute-definitions AttributeName=invoiceId,AttributeType=S \
  --key-schema AttributeName=invoiceId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST || true

awslocal dynamodb create-table \
  --table-name processedEvents \
  --attribute-definitions AttributeName=eventId,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST || true

echo "[localstack:init] Creating SNS topic and SQS queues..."

EVENTS_TOPIC_ARN=$(awslocal sns create-topic --name meterly-events --query 'TopicArn' --output text || echo '')

awslocal sqs create-queue --queue-name usage-queue || true
awslocal sqs create-queue --queue-name invoice-queue || true
awslocal sqs create-queue --queue-name webhook-queue || true

echo "[localstack:init] Creating S3 bucket..."
awslocal s3 mb s3://local-pdf-bucket || true

echo "[localstack:init] LocalStack resources ready."

