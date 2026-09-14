#!/usr/bin/env python3
"""Seed a Ghost-owned Kiro Crew revision from the legacy bootstrap secrets."""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


REGION = os.environ.get("AWS_REGION", "us-gov-west-1")
ENVIRONMENT = os.environ.get("ENV", "dev")
TABLE_NAME = os.environ.get(
    "GHOST_KIROCREW_CONFIG_TABLE_NAME",
    f"ghost-kirocrew-config-{ENVIRONMENT}",
)
PROFILE_ID = "PROFILE#default"
BOOTSTRAP_SECRET = os.environ.get("KIROCREW_BOOTSTRAP_SECRET", "gdms-crew/bootstrap")
PROFILE_SECRET = os.environ.get("KIROCREW_PROFILE_SECRET", "gdms-crew/profile")
CA_SECRET = os.environ.get("KIROCREW_CA_SECRET", "gdms-crew/ca")
FORBIDDEN_SECRET_NAME = re.compile(
    r"(^|[._-])(aws[_-]?(access[_-]?key|secret|session)|"
    r"access[_-]?key[_-]?id|secret[_-]?access[_-]?key|session[_-]?token|"
    r"ghost[._-]?oauth|registration[_-]?access[_-]?token|refresh[_-]?token|"
    r"authorization[_-]?code)($|[._-])",
    re.IGNORECASE,
)
JIRA_BASE_URL = os.environ.get("KIROCREW_JIRA_BASE_URL", "").strip().rstrip("/")
SKILLS_REPO_URL = os.environ.get("KIROCREW_SKILLS_REPO_URL", "").strip()
SKILLS_REPO_REF = os.environ.get("KIROCREW_SKILLS_REPO_REF", "master").strip()
SKILLS_REPO_SUBPATH = os.environ.get(
    "KIROCREW_SKILLS_REPO_SUBPATH", "skills"
).strip().strip("/")


def aws(*arguments: str, input_text: str | None = None) -> str:
    result = subprocess.run(
        ["aws", *arguments, "--region", REGION],
        input=input_text,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        message = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "AWS request failed"
        raise RuntimeError(message)
    return result.stdout


def read_secret(secret_id: str) -> Any:
    raw = aws(
        "secretsmanager",
        "get-secret-value",
        "--secret-id",
        secret_id,
        "--query",
        "SecretString",
        "--output",
        "text",
    )
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw.rstrip("\r\n")


def selected(source: Any, names: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(source, dict):
        return {}
    return {name: source[name] for name in names if name in source}


def build_records(bootstrap: Any, profile: Any, ca_document: Any) -> list[dict[str, Any]]:
    if not isinstance(bootstrap, dict) or not isinstance(profile, dict):
        raise ValueError("bootstrap and profile secrets must be JSON objects")
    values = profile.get("values")
    secrets = profile.get("secrets")
    if not isinstance(values, dict) or not isinstance(secrets, dict):
        raise ValueError("profile secret must contain values and secrets objects")
    start_url = values.get("startUrl")
    sso_region = values.get("ssoRegion")
    if not isinstance(start_url, str) or not start_url.startswith("https://") or not isinstance(sso_region, str):
        raise ValueError("profile secret has invalid Identity Center settings")

    ca_pem = ca_document.get("pem") if isinstance(ca_document, dict) else ca_document
    if not isinstance(ca_pem, str) or "-----BEGIN CERTIFICATE-----" not in ca_pem:
        raise ValueError("CA secret does not contain a certificate")

    install = selected(
        bootstrap.get("install"),
        (
            "products", "channel", "login", "setup", "deviceFlow",
            "identityProvider", "region", "minimumCrewVersion", "license",
        ),
    )
    crew_source = bootstrap.get("crew")
    crew = selected(
        crew_source,
        (
            "port", "apps", "appsTrusted", "allowThirdPartyApps", "injectCertifi",
            "sandboxAllowUnsandboxedExec", "agentEnv",
        ),
    )
    if isinstance(crew_source, dict) and isinstance(crew_source.get("registries"), list):
        crew["registries"] = [
            selected(row, ("name", "repo", "gitUrl", "branch", "trust"))
            for row in crew_source["registries"]
            if isinstance(row, dict)
        ]
        if ENVIRONMENT == "dev":
            for registry in crew["registries"]:
                registry["branch"] = "dev"
    tls = selected(
        bootstrap.get("tls"),
        ("gitHosts", "caSha256", "httpProxy", "httpsProxy", "noProxy"),
    )
    tls["caCertPem"] = ca_pem

    bootstrap_value = {
        "schemaVersion": 1,
        "install": install,
        "identityCenter": {
            "startUrl": start_url,
            "ssoRegion": sso_region,
            "lockStartUrl": True,
            "lockSsoRegion": True,
        },
        "crew": crew,
        "tls": tls,
    }
    organization = {
        "orgProfile": profile.get("orgProfile", ""),
        "lock": profile.get("lock", []),
        "values": selected(
            values,
            (
                "startUrl", "ssoRegion", "servicenowBaseUrl",
                "assignmentGroupId", "table",
            ),
        ),
        "assumeRoles": [
            selected(row, ("name", "roleArn", "sourceAccountId", "sourceRoleName"))
            for row in profile.get("assumeRoles", [])
            if isinstance(row, dict)
        ],
    }
    records: list[dict[str, Any]] = [
        {"name": "kirocrew.bootstrap", "type": "setting", "value": bootstrap_value},
        {"name": "kirocrew.organization", "type": "setting", "value": organization},
    ]
    for name, value in secrets.items():
        if not isinstance(name, str) or not isinstance(value, str) or not value:
            raise ValueError("profile contains an invalid named secret")
        if FORBIDDEN_SECRET_NAME.search(name):
            raise ValueError(f"profile contains prohibited credential name: {name}")
        records.append({"name": name, "type": "secret", "value": value})
    records.sort(key=lambda record: record["name"])
    return records


def attribute(value: Any) -> dict[str, Any]:
    if value is None:
        return {"NULL": True}
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, (int, float)):
        return {"N": str(value)}
    if isinstance(value, str):
        return {"S": value}
    if isinstance(value, list):
        return {"L": [attribute(item) for item in value]}
    if isinstance(value, dict):
        return {"M": {str(key): attribute(item) for key, item in value.items()}}
    raise TypeError(f"unsupported DynamoDB value type: {type(value).__name__}")


def item(value: dict[str, Any]) -> dict[str, Any]:
    return {key: attribute(child) for key, child in value.items()}


def decode_attribute(value: dict[str, Any]) -> Any:
    if "NULL" in value:
        return None
    if "BOOL" in value:
        return bool(value["BOOL"])
    if "N" in value:
        raw = str(value["N"])
        return float(raw) if "." in raw else int(raw)
    if "S" in value:
        return str(value["S"])
    if "L" in value:
        return [decode_attribute(child) for child in value["L"]]
    if "M" in value:
        return {key: decode_attribute(child) for key, child in value["M"].items()}
    raise ValueError("DynamoDB item contains an unsupported attribute")


def read_revision_records() -> list[dict[str, Any]]:
    revision = current_revision()
    if revision <= 0:
        raise ValueError("Kiro Crew configuration has no current revision")
    key = json.dumps({
        "profileId": {"S": PROFILE_ID},
        "recordId": {"S": f"REV#{revision:012d}"},
    })
    response = json.loads(aws(
        "dynamodb",
        "get-item",
        "--table-name",
        TABLE_NAME,
        "--consistent-read",
        "--key",
        key,
        "--output",
        "json",
    ) or "{}")
    raw = response.get("Item", {}).get("records")
    records = decode_attribute(raw) if isinstance(raw, dict) else None
    if not isinstance(records, list) or not all(isinstance(record, dict) for record in records):
        raise ValueError("current Kiro Crew revision has invalid records")
    return records


def merge_jira(records: list[dict[str, Any]], base_url: str) -> tuple[list[dict[str, Any]], bool]:
    parsed = urlparse(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError("KIROCREW_JIRA_BASE_URL must be an HTTPS origin without credentials")

    outgoing = json.loads(json.dumps(records))
    changed = False
    bootstrap = next(
        (record for record in outgoing if record.get("name") == "kirocrew.bootstrap"),
        None,
    )
    organization = next(
        (record for record in outgoing if record.get("name") == "kirocrew.organization"),
        None,
    )
    if not bootstrap or bootstrap.get("type") != "setting" or not isinstance(bootstrap.get("value"), dict):
        raise ValueError("current revision has no valid kirocrew.bootstrap record")
    if not organization or organization.get("type") != "setting" or not isinstance(organization.get("value"), dict):
        raise ValueError("current revision has no valid kirocrew.organization record")

    crew = dict(bootstrap["value"].get("crew") or {})
    apps = list(crew.get("apps") or [])
    if "jira-crew" not in apps:
        apps.append("jira-crew")
        crew["apps"] = apps
        bootstrap["value"]["crew"] = crew
        changed = True

    org_apps = dict(organization["value"].get("apps") or {})
    jira = dict(org_apps.get("jira-crew") or {})
    values = dict(jira.get("values") or {})
    if values.get("baseUrl") != base_url:
        values["baseUrl"] = base_url
        jira["values"] = values
        org_apps["jira-crew"] = jira
        organization["value"]["apps"] = org_apps
        changed = True

    outgoing.sort(key=lambda record: str(record.get("name") or ""))
    return outgoing, changed


def merge_skills_sync(
    records: list[dict[str, Any]],
    repo_url: str,
    ref: str,
    repo_subpath: str,
) -> tuple[list[dict[str, Any]], bool]:
    """Publish the organization skills source without replacing other records."""

    parsed = urlparse(repo_url)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError(
            "KIROCREW_SKILLS_REPO_URL must be an HTTPS URL without credentials"
        )
    if not ref:
        raise ValueError("KIROCREW_SKILLS_REPO_REF must not be empty")
    parts = repo_subpath.replace("\\", "/").split("/")
    if not repo_subpath or any(part in ("", ".", "..") for part in parts):
        raise ValueError(
            "KIROCREW_SKILLS_REPO_SUBPATH must be a safe repository-relative path"
        )

    outgoing = json.loads(json.dumps(records))
    bootstrap = next(
        (record for record in outgoing if record.get("name") == "kirocrew.bootstrap"),
        None,
    )
    if (
        not bootstrap
        or bootstrap.get("type") != "setting"
        or not isinstance(bootstrap.get("value"), dict)
    ):
        raise ValueError("current revision has no valid kirocrew.bootstrap record")

    desired = {
        "repo_url": repo_url,
        "repo_subpath": repo_subpath,
        "ref": ref,
        "auto_remediate": True,
        "locked": False,
        "require_operator_confirm": False,
    }
    current = dict(bootstrap["value"].get("provisioning_controls") or {})
    changed = current.get("skills_sync") != desired
    if changed:
        current["skills_sync"] = desired
        bootstrap["value"]["provisioning_controls"] = current
    outgoing.sort(key=lambda record: str(record.get("name") or ""))
    return outgoing, changed


def current_revision() -> int:
    key = json.dumps({
        "profileId": {"S": PROFILE_ID},
        "recordId": {"S": "CURRENT"},
    })
    response = json.loads(aws(
        "dynamodb",
        "get-item",
        "--table-name",
        TABLE_NAME,
        "--consistent-read",
        "--key",
        key,
        "--output",
        "json",
    ) or "{}")
    return int(response.get("Item", {}).get("revision", {}).get("N", "0"))


def publish(records: list[dict[str, Any]]) -> int:
    expected = current_revision()
    revision = expected + 1
    updated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    revision_item = item({
        "profileId": PROFILE_ID,
        "recordId": f"REV#{revision:012d}",
        "schemaVersion": 1,
        "revision": revision,
        "updatedAt": updated_at,
        "publishedBy": f"ci-seed:{os.environ.get('CI_COMMIT_SHORT_SHA', 'manual')}",
        "records": records,
    })
    pointer_item = item({
        "profileId": PROFILE_ID,
        "recordId": "CURRENT",
        "revision": revision,
        "updatedAt": updated_at,
    })
    pointer_put: dict[str, Any] = {
        "TableName": TABLE_NAME,
        "Item": pointer_item,
        "ConditionExpression": (
            "attribute_not_exists(recordId)" if expected == 0 else "revision = :expected"
        ),
    }
    if expected:
        pointer_put["ExpressionAttributeValues"] = {
            ":expected": {"N": str(expected)}
        }
    request = {
        "TransactItems": [
            {
                "Put": {
                    "TableName": TABLE_NAME,
                    "Item": revision_item,
                    "ConditionExpression": "attribute_not_exists(recordId)",
                }
            },
            {"Put": pointer_put},
        ]
    }
    with tempfile.TemporaryDirectory(prefix="kirocrew-seed-") as directory:
        path = Path(directory) / "transaction.json"
        path.write_text(json.dumps(request, separators=(",", ":")), encoding="utf-8")
        path.chmod(0o600)
        aws("dynamodb", "transact-write-items", "--cli-input-json", f"file://{path}")
    return revision


def main() -> None:
    if ENVIRONMENT != "dev" and os.environ.get("ALLOW_KIROCREW_PRODUCTION_SEED") != "true":
        raise SystemExit("refusing to seed a non-dev environment")
    if JIRA_BASE_URL or SKILLS_REPO_URL:
        records = read_revision_records()
        changed = False
        if JIRA_BASE_URL:
            records, jira_changed = merge_jira(records, JIRA_BASE_URL)
            changed = changed or jira_changed
        if SKILLS_REPO_URL:
            records, skills_changed = merge_skills_sync(
                records,
                SKILLS_REPO_URL,
                SKILLS_REPO_REF,
                SKILLS_REPO_SUBPATH,
            )
            changed = changed or skills_changed
        if not changed:
            print("Current Kiro Crew revision already contains the requested bindings")
            return
    else:
        records = build_records(
            read_secret(BOOTSTRAP_SECRET),
            read_secret(PROFILE_SECRET),
            read_secret(CA_SECRET),
        )
    revision = publish(records)
    print(f"Published Kiro Crew revision {revision} with {len(records)} records to {TABLE_NAME}")


if __name__ == "__main__":
    main()
