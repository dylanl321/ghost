"""Synchronize a validated pending Commercial credential into Ghost."""

import json
from concurrent.futures import ThreadPoolExecutor

import boto3

SECRET_FIELDS = (
    "commercial_aws_access_key_id",
    "commercial_aws_secret_access_key",
)
TARGETS = (
    ("ghost-dashboard-dev-credentials", "ghost-dashboard-dev", "ghost-dashboard-dev-service"),
    ("ghost-dashboard-credentials", "ghost-dashboard", "ghost-dashboard-service"),
)

def _sync_target(target, credential, secrets, ecs):
    secret_name, cluster, service = target
    current = secrets.get_secret_value(SecretId=secret_name)
    secret = json.loads(current["SecretString"])
    secret[SECRET_FIELDS[0]] = credential["access_key_id"]
    secret[SECRET_FIELDS[1]] = credential["secret_access_key"]
    secrets.put_secret_value(SecretId=secret_name, SecretString=json.dumps(secret))
    ecs.update_service(cluster=cluster, service=service, forceNewDeployment=True)
    ecs.get_waiter("services_stable").wait(cluster=cluster, services=[service])


# __NEXT__
