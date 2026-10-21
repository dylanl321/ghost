import importlib.util
import os
import pathlib
import unittest
from unittest.mock import Mock, patch

os.environ["SYNC_STATE_TABLE"] = "sync-state"
MODULE_PATH = pathlib.Path(__file__).parents[1] / "lambda" / "credential_sync.py"
SPEC = importlib.util.spec_from_file_location("credential_sync", MODULE_PATH)
credential_sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(credential_sync)


class CredentialSyncTests(unittest.TestCase):
    def test_rejects_missing_credential(self):
        with self.assertRaises(ValueError):
            credential_sync.lambda_handler({"version_id": "token"}, None)

    def test_claim_skips_completed_target(self):
        dynamodb = Mock()
        error = credential_sync.ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}},
            "PutItem",
        )
        dynamodb.put_item.side_effect = error
        dynamodb.get_item.return_value = {
            "Item": {"status": {"S": "SUCCEEDED"}}
        }
        self.assertFalse(credential_sync._claim(dynamodb, "token:secret"))

    def test_claim_rejects_duplicate_in_progress_target(self):
        dynamodb = Mock()
        error = credential_sync.ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException"}},
            "PutItem",
        )
        dynamodb.put_item.side_effect = error
        dynamodb.get_item.return_value = {
            "Item": {"status": {"S": "IN_PROGRESS"}}
        }
        with self.assertRaises(RuntimeError):
            credential_sync._claim(dynamodb, "token:secret")

    def test_claim_separates_lock_and_record_expiration(self):
        dynamodb = Mock()
        with patch.object(credential_sync.time, "time", return_value=1000):
            self.assertTrue(credential_sync._claim(dynamodb, "token:secret"))
        item = dynamodb.put_item.call_args.kwargs["Item"]
        self.assertEqual(
            item["lock_expires_at"]["N"],
            str(1000 + credential_sync.LOCK_SECONDS),
        )
        self.assertEqual(
            item["record_expires_at"]["N"],
            str(1000 + credential_sync.RECORD_RETENTION_SECONDS),
        )
        condition = dynamodb.put_item.call_args.kwargs["ConditionExpression"]
        self.assertIn("#status = :in_progress", condition)

    def test_waiter_budget_is_shared_across_remaining_targets(self):
        context = Mock()
        context.get_remaining_time_in_millis.return_value = 840000
        config = credential_sync._waiter_config(context, 2)
        self.assertEqual(config, {"Delay": 15, "MaxAttempts": 26})

    def test_waiter_rejects_insufficient_remaining_time(self):
        context = Mock()
        context.get_remaining_time_in_millis.return_value = 60000
        with self.assertRaises(RuntimeError):
            credential_sync._waiter_config(context, 1)


if __name__ == "__main__":
    unittest.main()


