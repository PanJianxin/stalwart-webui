import json
import sqlite3
import unittest
from unittest.mock import patch, MagicMock
import server

class CollectorTests(unittest.TestCase):
    def test_parser_keeps_only_finite_whitelist_and_missing_counter_zero(self):
        value = server.parseMetrics('server_memory 100\nsmtp_active_connections 2\nmessage_ingest_ham 3\nauth_failed NaN\nunknown_secret 123')
        self.assertEqual(value['memoryBytes'], 100)
        self.assertEqual(value['hamTotal'], 3)
        self.assertEqual(value['authFailedTotal'], 0)
        self.assertNotIn('unknown_secret', value)
        with self.assertRaises(ValueError): server.parseMetrics('server_memory NaN')

    def test_retention_and_api_mapping(self):
        db = server.openDatabase(':memory:')
        server.storeSample(db, 100, {'memoryBytes': 1})
        now = server.RETENTION_SECONDS + 200
        server.storeSample(db, now, {'memoryBytes': 2})
        result = server.readHistory(db, 168, now)
        self.assertEqual(len(result['samples']), 1)
        self.assertEqual(result['samples'][0], {'sampleTime': now, 'memoryBytes': 2})
        self.assertNotIn('sampled_time', json.dumps(result))
        self.assertEqual(db.execute('SELECT name FROM sqlite_master WHERE type="index" AND name="idx__sampled_time"').fetchone()[0], 'idx__sampled_time')
        db.close()

    def test_requires_verified_metrics_permission(self):
        self.assertEqual(server.authorize(None), 401)
        self.assertEqual(server.authorize('arbitrary'), 401)
        response = MagicMock()
        response.__enter__.return_value.read.return_value = b'{"permissions":[]}'
        with patch.object(server.HTTP, 'open', return_value=response):
            self.assertEqual(server.authorize('Bearer fake-test-token'), 403)
        response.__enter__.return_value.read.return_value = b'{"permissions":["sysMetricsGet"]}'
        with patch.object(server.HTTP, 'open', return_value=response):
            self.assertEqual(server.authorize('Bearer fake-test-token'), 200)

if __name__ == '__main__': unittest.main()
