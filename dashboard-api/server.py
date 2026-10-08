"""Internal aggregate metrics collector. Never logs or stores authentication headers."""
import json
import math
import os
import re
import sqlite3
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, build_opener, ProxyHandler

UPSTREAM = os.environ.get('STALWART_URL', 'http://stalwart:8080')
DATABASE = os.environ.get('DASHBOARD_DATABASE', '/data/metrics.sqlite3')
INTERVAL_SECONDS = 60
RETENTION_SECONDS = 7 * 86400
# External Prometheus spelling is mapped here to our camelCase wire contract.
METRIC_NAMES = {
    'server_memory': 'memoryBytes',
    'smtp_active_connections': 'smtpConnections',
    'delivery_active_connections': 'deliveryConnections',
    'imap_active_connections': 'imapConnections',
    'pop3_active_connections': 'pop3Connections',
    'http_active_connections': 'httpConnections',
    'sieve_active_connections': 'sieveConnections',
    'message_ingest_ham': 'hamTotal',
    'message_ingest_spam': 'spamTotal',
    'delivery_completed': 'deliveryTotal',
    'auth_failed': 'authFailedTotal',
    'auth_success': 'authSuccessTotal',
    'smtp_connection_start': 'smtpSessionsTotal',
    'message_ingest_error': 'ingestErrorTotal',
    'queue_message_queued': 'inboundTotal',
    'queue_authenticated_message_queued': 'submissionTotal',
}
COUNTERS = {key for key in METRIC_NAMES.values() if key.endswith('Total')}
HTTP = build_opener(ProxyHandler({}))
REQUEST_SLOTS = threading.BoundedSemaphore(16)
collectorError = None


def parseMetrics(text):
    result = {key: 0 for key in COUNTERS}  # Native exporter omits zero event counters.
    for line in text.splitlines():
        match = re.fullmatch(r'([a-zA-Z_][\w]*)\s+([^\s]+)(?:\s+\d+)?', line)
        if match and match[1] in METRIC_NAMES:
            value = float(match[2])
            if math.isfinite(value) and value >= 0:
                result[METRIC_NAMES[match[1]]] = value
    if 'memoryBytes' not in result:
        raise ValueError('Expected native memory gauge is missing')
    return result


def openDatabase(database=DATABASE):
    connection = sqlite3.connect(database, timeout=10)
    connection.execute('PRAGMA journal_mode=WAL')
    connection.executescript(Path(__file__).with_name('schema.sql').read_text())
    return connection


def storeSample(connection, sampleTime, metrics):
    with connection:
        connection.execute('INSERT INTO metric_sample (id, sampled_time, metrics_json) VALUES (?, ?, ?)',
                           (uuid.uuid4().hex, sampleTime, json.dumps(metrics, allow_nan=False)))
        connection.execute('DELETE FROM metric_sample WHERE sampled_time < ?', (sampleTime - RETENTION_SECONDS,))


def readHistory(connection, hours, now):
    first = connection.execute('SELECT MIN(sampled_time) FROM metric_sample').fetchone()[0]
    rows = connection.execute('SELECT sampled_time, metrics_json FROM metric_sample WHERE sampled_time >= ? ORDER BY sampled_time',
                              (now - hours * 3600,)).fetchall()
    return {'generatedTime': now, 'collectionStartTime': first, 'intervalSeconds': INTERVAL_SECONDS,
            'retentionDays': 7, 'samples': [{'sampleTime': t, **json.loads(data)} for t, data in rows],
            'collectorError': collectorError}


def authorize(auth):
    if not auth or not (auth.startswith('Bearer ') or auth.startswith('Basic ')):
        return 401
    try:
        with HTTP.open(Request(UPSTREAM + '/api/account', headers={'Authorization': auth}), timeout=8) as response:
            account = json.load(response)
        return 200 if 'sysMetricsGet' in account.get('permissions', []) else 403
    except HTTPError as error:
        return 401 if error.code == 401 else 403
    except (URLError, TimeoutError, ValueError):
        return 503


def collectForever():
    global collectorError
    connection = openDatabase()
    while True:
        started = time.monotonic()
        try:
            with HTTP.open(UPSTREAM + '/metrics/prometheus', timeout=10) as response:
                metrics = parseMetrics(response.read(2_000_000).decode())
            storeSample(connection, int(time.time()), metrics)
            collectorError = None
        except Exception:
            collectorError = '指标采集暂时失败，显示最后一次成功采样。'
        time.sleep(max(1, INTERVAL_SECONDS - (time.monotonic() - started)))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/healthz':
            self.respond(200, {'status': 'ok'})
            return
        if parsed.path != '/api/panda/dashboard':
            self.respond(404, {'error': '未找到接口'})
            return
        if not REQUEST_SLOTS.acquire(blocking=False):
            self.respond(429, {'error': '请求过于频繁'})
            return
        try:
            status = authorize(self.headers.get('Authorization'))
            if status != 200:
                self.respond(status, {'error': '请使用拥有指标读取权限的管理员账户登录'})
                return
            try:
                hours = int(parse_qs(parsed.query).get('hours', ['24'])[0])
            except ValueError:
                hours = 0
            if hours not in (1, 24, 168):
                self.respond(400, {'error': '时间范围无效'})
                return
            connection = openDatabase()
            try:
                self.respond(200, readHistory(connection, hours, int(time.time())))
            finally:
                connection.close()
        finally:
            REQUEST_SLOTS.release()


if __name__ == '__main__':
    threading.Thread(target=collectForever, daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8090), Handler).serve_forever()
