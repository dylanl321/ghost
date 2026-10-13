#!/usr/bin/env python3
"""Print redacted recent Kiro Crew/OAuth errors from the dev ECS log group."""

from __future__ import annotations

import json
import os
import re
import subprocess
import time
from datetime import datetime, timezone


REGION = os.environ.get("AWS_REGION", "us-gov-west-1")
APP_NAME = os.environ.get("APP_NAME", "ghost-dashboard-dev")
LOOKBACK_MINUTES = min(120, max(1, int(os.environ.get("KIROCREW_LOG_LOOKBACK_MINUTES", "30"))))


def redact(message: str) -> str:
    message = re.sub(r"(https?://[^\s?]+)\?[^\s]+", r"\1?[REDACTED]", message)
    message = re.sub(
        r"(?i)(code|state|access[_-]?token|refresh[_-]?token|authorization|"
        r"client[_-]?secret|password|secret)(\s*[=:]\s*)([^\s,;}]+)",
        r"\1\2[REDACTED]",
        message,
    )
    message = re.sub(r"(?i)(Bearer\s+)[^\s]+", r"\1[REDACTED]", message)
    message = re.sub(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", "[EMAIL]", message)
    message = re.sub(
        r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
        "[UUID]",
        message,
        flags=re.IGNORECASE,
    )
    return message


def main() -> None:
    start_time = int((time.time() - LOOKBACK_MINUTES * 60) * 1000)
    result = subprocess.run(
        [
            "aws", "logs", "filter-log-events",
            "--log-group-name", f"/ecs/{APP_NAME}",
            "--start-time", str(start_time),
            "--region", REGION,
            "--output", "json",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        raise SystemExit(result.stderr.strip().splitlines()[-1] or "CloudWatch query failed")
    events = json.loads(result.stdout).get("events", [])
    relevant = []
    for event in events:
        message = str(event.get("message") or "")
        lowered = message.lower()
        if (
            "kirocrew" in lowered
            or "kiro crew" in lowered
            or "mcp oauth" in lowered
            or ("error" in lowered and "oauth" in lowered)
            or '"statuscode":500' in lowered
        ):
            relevant.append((int(event.get("timestamp") or 0), redact(message)))
    for timestamp, message in relevant[-100:]:
        when = datetime.fromtimestamp(timestamp / 1000, timezone.utc).isoformat()
        print(f"{when} {message.rstrip()}")
    print(f"Printed {min(len(relevant), 100)} redacted matching event(s)")


if __name__ == "__main__":
    main()
