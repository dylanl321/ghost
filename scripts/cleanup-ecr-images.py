#!/usr/bin/env python3
"""Audit and delete stale ECR images that are not protected by active tags."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Sequence


DEFAULT_REGION = "us-gov-west-1"
DEFAULT_TAGGED_RETENTION_DAYS = 30
DEFAULT_UNTAGGED_RETENTION_DAYS = 7
ECR_BATCH_SIZE = 100


class CleanupError(RuntimeError):
    """Raised when the cleanup cannot continue safely."""


@dataclass(frozen=True)
class ImageRecord:
    digest: str
    tags: tuple[str, ...]
    pushed_at: datetime

    def age_days(self, now: datetime) -> int:
        return max(0, int((now - self.pushed_at).total_seconds() // 86400))


@dataclass(frozen=True)
class SelectionResult:
    candidates: tuple[ImageRecord, ...]
    protected: tuple[ImageRecord, ...]
    retained: tuple[ImageRecord, ...]
    warnings: tuple[str, ...]


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("value must be at least 1")
    return parsed


def parse_timestamp(value: Any) -> datetime:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    if not isinstance(value, str) or not value:
        raise ValueError("imagePushedAt is missing")

    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def image_from_detail(detail: dict[str, Any]) -> ImageRecord:
    digest = detail.get("imageDigest")
    if not isinstance(digest, str) or not digest:
        raise ValueError("imageDigest is missing")

    raw_tags = detail.get("imageTags") or []
    tags = tuple(sorted(tag for tag in raw_tags if isinstance(tag, str)))
    return ImageRecord(
        digest=digest,
        tags=tags,
        pushed_at=parse_timestamp(detail.get("imagePushedAt")),
    )


def select_candidates(
    image_details: Sequence[dict[str, Any]],
    environment: str,
    tagged_retention_days: int,
    untagged_retention_days: int,
    extra_protected_tags: Sequence[str] = (),
    now: datetime | None = None,
) -> SelectionResult:
    current_time = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    records: list[ImageRecord] = []
    warnings: list[str] = []

    for detail in image_details:
        try:
            records.append(image_from_detail(detail))
        except (TypeError, ValueError) as error:
            digest = detail.get("imageDigest", "unknown")
            warnings.append(f"Skipping {digest}: {error}")

    active = [record for record in records if environment in record.tags]
    if len(active) != 1:
        raise CleanupError(
            f"Expected exactly one image tagged '{environment}', found {len(active)}; "
            "refusing to select deletion candidates."
        )

    protected_tags = {environment, *extra_protected_tags}
    tagged_cutoff = current_time - timedelta(days=tagged_retention_days)
    untagged_cutoff = current_time - timedelta(days=untagged_retention_days)
    candidates: list[ImageRecord] = []
    protected: list[ImageRecord] = []
    retained: list[ImageRecord] = []

    for record in records:
        if protected_tags.intersection(record.tags):
            protected.append(record)
            continue

        cutoff = tagged_cutoff if record.tags else untagged_cutoff
        if record.pushed_at < cutoff:
            candidates.append(record)
        else:
            retained.append(record)

    key = lambda image: (image.pushed_at, image.digest)
    return SelectionResult(
        candidates=tuple(sorted(candidates, key=key)),
        protected=tuple(sorted(protected, key=key)),
        retained=tuple(sorted(retained, key=key)),
        warnings=tuple(warnings),
    )


def run_aws_json(arguments: Sequence[str], profile: str | None = None) -> dict[str, Any]:
    command = ["aws"]
    if profile:
        command.extend(["--profile", profile])
    command.extend(arguments)
    command.extend(["--output", "json"])

    try:
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as error:
        raise CleanupError("AWS CLI was not found on PATH") from error

    if completed.returncode != 0:
        message = completed.stderr.strip() or completed.stdout.strip() or "unknown AWS CLI error"
        raise CleanupError(f"AWS CLI command failed: {message}")

    try:
        return json.loads(completed.stdout or "{}")
    except json.JSONDecodeError as error:
        raise CleanupError("AWS CLI returned invalid JSON") from error


def list_image_details(repository: str, region: str, profile: str | None) -> list[dict[str, Any]]:
    response = run_aws_json(
        [
            "ecr",
            "describe-images",
            "--repository-name",
            repository,
            "--region",
            region,
            "--filter",
            "tagStatus=ANY",
        ],
        profile,
    )
    details = response.get("imageDetails", [])
    if not isinstance(details, list):
        raise CleanupError("AWS CLI response did not contain an imageDetails list")
    return details


def chunks(items: Sequence[ImageRecord], size: int = ECR_BATCH_SIZE) -> list[Sequence[ImageRecord]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def delete_images(
    repository: str,
    region: str,
    profile: str | None,
    images: Sequence[ImageRecord],
) -> tuple[int, tuple[dict[str, Any], ...]]:
    deleted_count = 0
    failures: list[dict[str, Any]] = []

    for batch in chunks(images):
        response = run_aws_json(
            [
                "ecr",
                "batch-delete-image",
                "--repository-name",
                repository,
                "--region",
                region,
                "--image-ids",
                *(f"imageDigest={image.digest}" for image in batch),
            ],
            profile,
        )
        deleted_count += len(response.get("imageIds", []))
        batch_failures = response.get("failures", [])
        if isinstance(batch_failures, list):
            failures.extend(failure for failure in batch_failures if isinstance(failure, dict))

    return deleted_count, tuple(failures)


def confirm_deletion(repository: str, input_fn: Callable[[str], str] = input) -> bool:
    try:
        answer = input_fn(f"Type the repository name '{repository}' to confirm deletion: ")
    except EOFError:
        return False
    return answer.strip() == repository


def format_tags(tags: Sequence[str]) -> str:
    return ",".join(tags) if tags else "<untagged>"


def print_report(
    repository: str,
    result: SelectionResult,
    now: datetime,
    tagged_retention_days: int,
    untagged_retention_days: int,
) -> None:
    print(f"Repository: {repository}")
    print(
        f"Retention: tagged={tagged_retention_days} days, "
        f"untagged={untagged_retention_days} days"
    )
    print(
        f"Summary: {len(result.candidates)} candidates, {len(result.protected)} protected, "
        f"{len(result.retained)} retained"
    )

    if result.candidates:
        print("\nDeletion candidates (oldest first):")
        for image in result.candidates:
            pushed_at = image.pushed_at.isoformat().replace("+00:00", "Z")
            print(
                f"  {image.digest} | pushed={pushed_at} | age={image.age_days(now)}d "
                f"| tags={format_tags(image.tags)}"
            )
    else:
        print("\nNo images are eligible for deletion.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Audit stale ECR images and optionally delete them after confirmation.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Examples:
  python3 scripts/cleanup-ecr-images.py --repository ghost-dashboard-dev --environment dev
  python3 scripts/cleanup-ecr-images.py --repository ghost-dashboard --environment prod --apply
""",
    )
    parser.add_argument("--repository", required=True, help="ECR repository name")
    parser.add_argument("--environment", required=True, choices=("dev", "prod"))
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--profile", help="Optional AWS CLI profile")
    parser.add_argument(
        "--tagged-retention-days",
        type=positive_int,
        default=DEFAULT_TAGGED_RETENTION_DAYS,
    )
    parser.add_argument(
        "--untagged-retention-days",
        type=positive_int,
        default=DEFAULT_UNTAGGED_RETENTION_DAYS,
    )
    parser.add_argument(
        "--protect-tag",
        action="append",
        default=[],
        help="Additional tag to protect; may be supplied more than once",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete selected images after interactive repository confirmation",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    now = datetime.now(timezone.utc)

    try:
        image_details = list_image_details(args.repository, args.region, args.profile)
        result = select_candidates(
            image_details=image_details,
            environment=args.environment,
            tagged_retention_days=args.tagged_retention_days,
            untagged_retention_days=args.untagged_retention_days,
            extra_protected_tags=args.protect_tag,
            now=now,
        )

        for warning in result.warnings:
            print(f"Warning: {warning}", file=sys.stderr)
        print_report(
            repository=args.repository,
            result=result,
            now=now,
            tagged_retention_days=args.tagged_retention_days,
            untagged_retention_days=args.untagged_retention_days,
        )

        if not args.apply or not result.candidates:
            if result.candidates:
                print("\nDry run only. Re-run with --apply to delete these images.")
            return 0

        if not confirm_deletion(args.repository):
            print("Deletion cancelled; repository name did not match.", file=sys.stderr)
            return 2

        deleted_count, failures = delete_images(
            repository=args.repository,
            region=args.region,
            profile=args.profile,
            images=result.candidates,
        )
        print(f"Deleted {deleted_count} image(s).")

        if failures:
            for failure in failures:
                print(f"Deletion failure: {json.dumps(failure, sort_keys=True)}", file=sys.stderr)
            return 1
        return 0
    except CleanupError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
