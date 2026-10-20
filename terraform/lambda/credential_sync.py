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
# Durable per-version target state makes retries safe after partial completion.
STATE_TABLE = os.environ["SYNC_STATE_TABLE"]


def _claim(dynamodb, rotation_target):
    now = int(time.time())
    try:
        dynamodb.put_item(
            TableName=STATE_TABLE,
            Item={
                "rotation_target": {"S": rotation_target},
                "status": {"S": "IN_PROGRESS"},
                "expires_at": {"N": str(now + 900)},
            },
            ConditionExpression=(
                "attribute_not_exists(rotation_target) OR expires_at < :now"
            ),
            ExpressionAttributeValues={":now": {"N": str(now)}},
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
        if item.get("status", {}).get("S") == "SUCCEEDED":
            return False
        raise RuntimeError("Synchronization target is already in progress") from exc


def _sync_target(target, credential, secrets, ecs):
    secret_name, cluster, service = target
    current = secrets.get_secret_value(SecretId=secret_name)
    secret = json.loads(current["SecretString"])
    secret[SECRET_FIELDS[0]] = credential["access_key_id"]
    secret[SECRET_FIELDS[1]] = credential["secret_access_key"]
    secrets.put_secret_value(
        SecretId=secret_name,
        ClientRequestToken=credential["rotation_token"],
        SecretString=json.dumps(secret),
    )
    ecs.update_service(cluster=cluster, service=service, forceNewDeployment=True)
    ecs.get_waiter("services_stable").wait(cluster=cluster, services=[service])


def lambda_handler(event, context):
    if not isinstance(event, dict):
        raise ValueError("Lambda event must be an object")
    credential = event.get("credential")
    if (
        not isinstance(credential, dict)
        or not isinstance(credential.get("access_key_id"), str)
        or not credential["access_key_id"].strip()
        or not isinstance(credential.get("secret_access_key"), str)
        or not credential["secret_access_key"].strip()
    ):
        raise ValueError("Validated pending credential is required")

    version_id = event.get("version_id")
    if not isinstance(version_id, str) or not version_id.strip():
        raise ValueError("Rotation version_id is required")
    credential["rotation_token"] = version_id

    secrets = boto3.client("secretsmanager")
    ecs = boto3.client("ecs")
    dynamodb = boto3.client("dynamodb")
    synced = 0
    for target in TARGETS:
        rotation_target = f"{version_id}:{target[0]}"
        if not _claim(dynamodb, rotation_target):
            synced += 1
            continue
        _sync_target(target, credential, secrets, ecs)
        dynamodb.update_item(
            TableName=STATE_TABLE,
            Key={"rotation_target": {"S": rotation_target}},
            UpdateExpression="SET #status = :status",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": {"S": "SUCCEEDED"}},
        )
        synced += 1
    return {"status": "success", "synced_consumers": synced}

