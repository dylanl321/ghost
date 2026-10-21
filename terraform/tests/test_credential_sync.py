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


if __name__ == "__main__":
    unittest.main()


