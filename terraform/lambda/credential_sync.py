"""Synchronize a validated pending Commercial credential into Ghost."""

import json
import os
import time

import boto3
from botocore.exceptions import ClientError

SECRET_FIELDS = (
    "commercial_aws_access_key_id",
    "commercial_aws_secret_access_key",
)
TARGETS = (
    ("ghost-dashboard-dev-credentials", "ghost-dashboard-dev", "ghost-dashboard-dev-service"),
    ("ghost-dashboard-credentials", "ghost-dashboard", "ghost-dashboard-service"),
)
STATE_TABLE = os.environ["SYNC_STATE_TABLE"]


def _claim(dynamodb, rotation_target):
    now = int(time.time())
    try:
        dynamodb.put_item(
            TableName=STATE_TABLE,
            Item={
                "rotation_target": {"S": rotation_target},
                "status": {"S": "IN_PROGRESS"},
                "expires_at": {"N": str(now + 86400)},
            },
            ConditionExpression="attribute_not_exists(rotation_target)",
        )
        return True
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        item = dynamodb.get_item(
            TableName=STATE_TABLE,
            Key={"rotation_target": {"S": rotation_target}},
            ConsistentRead=True,
        ).get("Item", {})
        return item.get("status", {}).get("S") != "SUCCEEDED"


def _sync_target(target, credential, secrets, ecs):
    secret_name, cluster, service = target
    current = secrets.get_secret_value(SecretId=secret_name)
    secret = json.loads(current["SecretString"])
    secret[SECRET_FIELDS[0]] = credential["access_key_id"]
    secret[SECRET_FIELDS[1]] = credential["secret_access_key"]
    secrets.put_secret_value(SecretId=secret_name, SecretString=json.dumps(secret))
    ecs.update_service(cluster=cluster, service=service, forceNewDeployment=True)
    ecs.get_waiter("services_stable").wait(cluster=cluster, services=[service])


def lambda_handler(event, context):
    credential = event.get("credential") or {}
    if not credential.get("access_key_id") or not credential.get("secret_access_key"):
        raise ValueError("Validated pending credential is required")

    secrets = boto3.client("secretsmanager")
    ecs = boto3.client("ecs")
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(_sync_target, target, credential, secrets, ecs)
            for target in TARGETS
        ]
        for future in futures:
            future.result()
    return {"status": "success", "synced_consumers": len(TARGETS)}

