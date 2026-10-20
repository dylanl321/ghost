import importlib.util
import os
import pathlib
import unittest
from unittest.mock import Mock

os.environ["SYNC_STATE_TABLE"] = "sync-state"
MODULE_PATH = pathlib.Path(__file__).parents[1] / "lambda" / "credential_sync.py"
SPEC = importlib.util.spec_from_file_location("credential_sync", MODULE_PATH)
credential_sync = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(credential_sync)


class CredentialSyncTests(unittest.TestCase):
    def test_rejects_missing_credential(self):
        with self.assertRaises(ValueError):
            credential_sync.lambda_handler({"version_id": "token"}, None)

    # __NEXT__

