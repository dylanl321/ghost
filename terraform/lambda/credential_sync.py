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

# __NEXT__
