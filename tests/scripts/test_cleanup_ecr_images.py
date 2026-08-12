import importlib.util
import io
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "cleanup-ecr-images.py"
SPEC = importlib.util.spec_from_file_location("cleanup_ecr_images", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
cleanup = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = cleanup
SPEC.loader.exec_module(cleanup)


NOW = datetime(2026, 8, 11, 12, 0, tzinfo=timezone.utc)


def image(digest, days_old, tags=None):
    return {
        "imageDigest": digest,
        "imageTags": tags or [],
        "imagePushedAt": (NOW - timedelta(days=days_old)).isoformat(),
    }


class CandidateSelectionTests(unittest.TestCase):
    def test_selects_stale_images_and_protects_active_and_named_tags(self):
        details = [
            image("sha256:active", 120, ["prod", "prod-active"]),
            image("sha256:old-commit", 31, ["prod-old"]),
            image("sha256:recent-commit", 29, ["prod-recent"]),
            image("sha256:legacy", 90, ["release-2025"]),
            image("sha256:protected", 90, ["investigation-hold"]),
            image("sha256:old-untagged", 8),
            image("sha256:recent-untagged", 6),
        ]

        result = cleanup.select_candidates(
            details,
            environment="prod",
            tagged_retention_days=30,
            untagged_retention_days=7,
            extra_protected_tags=["investigation-hold"],
            now=NOW,
        )

        self.assertEqual(
            {record.digest for record in result.candidates},
            {"sha256:old-commit", "sha256:legacy", "sha256:old-untagged"},
        )
        self.assertEqual(
            {record.digest for record in result.protected},
            {"sha256:active", "sha256:protected"},
        )
        self.assertEqual(
            {record.digest for record in result.retained},
            {"sha256:recent-commit", "sha256:recent-untagged"},
        )

    def test_does_not_select_images_exactly_at_retention_boundary(self):
        result = cleanup.select_candidates(
            [image("sha256:active", 40, ["dev"]), image("sha256:boundary", 30, ["dev-boundary"])],
            environment="dev",
            tagged_retention_days=30,
            untagged_retention_days=7,
            now=NOW,
        )

        self.assertEqual(result.candidates, ())
        self.assertEqual([record.digest for record in result.retained], ["sha256:boundary"])

    def test_refuses_to_continue_without_exact_active_tag(self):
        with self.assertRaisesRegex(cleanup.CleanupError, "Expected exactly one image tagged 'prod'"):
            cleanup.select_candidates(
                [image("sha256:old", 60, ["prod-old"])],
                environment="prod",
                tagged_retention_days=30,
                untagged_retention_days=7,
                now=NOW,
            )

    def test_skips_malformed_records_with_warning(self):
        result = cleanup.select_candidates(
            [image("sha256:active", 1, ["dev"]), {"imageDigest": "sha256:invalid"}],
            environment="dev",
            tagged_retention_days=30,
            untagged_retention_days=7,
            now=NOW,
        )

        self.assertEqual(len(result.warnings), 1)
        self.assertIn("sha256:invalid", result.warnings[0])


class DeletionTests(unittest.TestCase):
    def test_batches_deletions_at_ecr_limit(self):
        records = [
            cleanup.ImageRecord(
                digest=f"sha256:{index:064x}",
                tags=(),
                pushed_at=NOW - timedelta(days=10),
            )
            for index in range(205)
        ]
        batch_sizes = []

        def fake_run(arguments, profile=None):
            image_ids_index = arguments.index("--image-ids") + 1
            batch_size = len(arguments) - image_ids_index
            batch_sizes.append(batch_size)
            return {"imageIds": [{}] * batch_size, "failures": []}

        with patch.object(cleanup, "run_aws_json", side_effect=fake_run):
            deleted, failures = cleanup.delete_images("repo", "us-gov-west-1", None, records)

        self.assertEqual(batch_sizes, [100, 100, 5])
        self.assertEqual(deleted, 205)
        self.assertEqual(failures, ())

    def test_returns_partial_failures(self):
        record = cleanup.ImageRecord(
            digest="sha256:failed",
            tags=("legacy",),
            pushed_at=NOW - timedelta(days=90),
        )
        response = {
            "imageIds": [],
            "failures": [{"imageId": {"imageDigest": record.digest}, "failureCode": "ImageNotFound"}],
        }

        with patch.object(cleanup, "run_aws_json", return_value=response):
            deleted, failures = cleanup.delete_images("repo", "us-gov-west-1", None, [record])

        self.assertEqual(deleted, 0)
        self.assertEqual(failures[0]["failureCode"], "ImageNotFound")

    def test_confirmation_requires_exact_repository_name(self):
        self.assertTrue(cleanup.confirm_deletion("ghost-dashboard", lambda _: "ghost-dashboard"))
        self.assertFalse(cleanup.confirm_deletion("ghost-dashboard", lambda _: "ghost-dashboard-dev"))

    def test_main_is_dry_run_by_default(self):
        details = [
            image("sha256:active", 90, ["prod", "prod-active"]),
            image("sha256:stale", 31, ["prod-stale"]),
        ]

        with (
            patch.object(cleanup, "list_image_details", return_value=details),
            patch.object(cleanup, "delete_images") as delete_images,
            patch("sys.stdout", new_callable=io.StringIO) as stdout,
        ):
            exit_code = cleanup.main(["--repository", "ghost-dashboard", "--environment", "prod"])

        self.assertEqual(exit_code, 0)
        delete_images.assert_not_called()
        self.assertIn("Dry run only", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
