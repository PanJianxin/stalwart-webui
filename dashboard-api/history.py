"""Mailbox metadata archive. Credentials are decrypted into memory; never logged."""
import base64
import json
import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.request import Request

RETENTION_SECONDS = 90 * 86400
syncLock = threading.Lock()
lastSyncTime = None
syncError = None
running = False


def addressList(value):
    return [{'name': str(x.get('name') or '')[:300], 'email': str(x.get('email') or '')[:500]}
            for x in value or [] if isinstance(x, dict)]


def messageTimestamp(value, fallback):
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())
    except (ValueError, TypeError, AttributeError):
        return fallback


def storeMessages(connection, account, folders, messages, now):
    with connection:
        for message in messages:
            if message.get('keywords', {}).get('$draft'):
                continue
            names = [folders.get(key, {'name': key, 'role': None}) for key in message.get('mailboxIds', {})]
            direction = 'sent' if any(x.get('role') == 'sent' for x in names) else 'received'
            emailId = message['id']
            recordId = uuid.uuid5(uuid.NAMESPACE_URL, 'panda-mail:' + account['id'] + ':' + emailId).hex
            existing = connection.execute('SELECT direction FROM mail_history WHERE account_id = ? AND email_id = ?', (account['id'], emailId)).fetchone()
            if existing and existing[0] == 'sent': direction = 'sent'
            metadata = {
                'accountName': account.get('name', ''), 'accountAddress': account.get('emailAddress', ''),
                'subject': str(message.get('subject') or '')[:2000],
                'from': addressList(message.get('from')), 'to': addressList(message.get('to')),
                'cc': addressList(message.get('cc')), 'messageIds': message.get('messageId') or [],
                'folders': names, 'sizeBytes': message.get('size', 0),
                'sentTime': message.get('sentAt'), 'receivedTime': message.get('receivedAt'),
                'status': 'sentCopy' if direction == 'sent' else 'stored', 'source': 'mailbox',
            }
            connection.execute('''INSERT INTO mail_history
                (id, account_id, email_id, direction, message_time, first_seen_time, updated_time, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(account_id, email_id)
                DO UPDATE SET updated_time=excluded.updated_time, metadata_json=excluded.metadata_json,
                direction=excluded.direction''',
                (recordId, account['id'], emailId, direction,
                 messageTimestamp(message.get('receivedAt'), now), now, now, json.dumps(metadata, ensure_ascii=False)))
        connection.execute('DELETE FROM mail_history WHERE message_time < ?', (now - RETENTION_SECONDS,))


def record(row):
    return {'id': row[0], 'accountId': row[1], 'emailId': row[2], 'direction': row[3],
            'messageTime': row[4], 'firstSeenTime': row[5], 'updatedTime': row[6], **json.loads(row[7])}


def queryHistory(connection, direction, search, page, accountId=''):
    conditions = ['message_time >= ?']
    params = [int(time.time()) - RETENTION_SECONDS]
    if direction in ('received', 'sent'):
        conditions.append('direction = ?'); params.append(direction)
    if accountId:
        conditions.append('account_id = ?'); params.append(accountId)
    if search:
        conditions.append('metadata_json LIKE ?'); params.append('%' + search[:200] + '%')
    where = ' AND '.join(conditions)
    total = connection.execute('SELECT COUNT(*) FROM mail_history WHERE ' + where, params).fetchone()[0]
    rows = connection.execute('SELECT * FROM mail_history WHERE ' + where +
                              ' ORDER BY message_time DESC, id DESC LIMIT 50 OFFSET ?', params + [(page - 1) * 50]).fetchall()
    return {'items': [record(row) for row in rows], 'total': total, 'page': page, 'pageSize': 50,
            'lastSyncTime': lastSyncTime or connection.execute('SELECT MAX(updated_time) FROM mail_sync_state').fetchone()[0], 'syncError': syncError, 'syncRunning': running,
            'retentionDays': 90, 'collectionIntervalSeconds': 30}


def historyDetail(connection, recordId):
    row = connection.execute('SELECT * FROM mail_history WHERE id = ? AND message_time >= ?',
                             (recordId, int(time.time()) - RETENTION_SECONDS)).fetchone()
    return record(row) if row else None


class MailCollector:
    def __init__(self, opener, upstream, openDatabase):
        self.opener, self.upstream, self.openDatabase = opener, upstream, openDatabase
        self.authorization = None
        self.managementAccountId = None

    def credentials(self):
        if self.authorization is None:
            password = subprocess.run(['age', '--decrypt', '-i', '/run/history/identity.txt',
                                       '/run/history/admin-password.age'], check=True,
                                      stdout=subprocess.PIPE, stderr=subprocess.DEVNULL).stdout.decode()
            username = os.environ.get('HISTORY_USERNAME', 'admin@pandamail.top')
            self.authorization = 'Basic ' + base64.b64encode((username + ':' + password).encode()).decode()

    def request(self, path, payload=None):
        self.credentials()
        req = Request(self.upstream + path, data=json.dumps(payload).encode() if payload else None,
                      headers={'Authorization': self.authorization, 'Content-Type': 'application/json'})
        with self.opener.open(req, timeout=30) as response:
            return json.load(response)

    def call(self, method, args, management=False):
        result = self.request('/jmap', {'using': ['urn:ietf:params:jmap:core',
            'urn:stalwart:jmap' if management else 'urn:ietf:params:jmap:mail'],
            'methodCalls': [[method, args, 'c']]})['methodResponses'][0]
        if result[0] == 'error':
            raise RuntimeError('JMAP operation failed')
        return result[1]

    def sync(self):
        global lastSyncTime, syncError, running
        if not syncLock.acquire(blocking=False):
            return
        connection = self.openDatabase()
        running = True
        try:
            if not self.managementAccountId:
                session = self.request('/jmap/session')
                self.managementAccountId = session['primaryAccounts']['urn:stalwart:jmap']
            accounts = []
            position = 0
            while True:
                ids = self.call('x:Account/query', {'accountId': self.managementAccountId,
                    'position': position, 'limit': 100}, True).get('ids', [])
                if not ids: break
                accounts.extend(self.call('x:Account/get', {'accountId': self.managementAccountId,
                    'ids': ids, 'properties': ['id', '@type', 'name', 'emailAddress']}, True).get('list', []))
                position += len(ids)
                if len(ids) < 100: break
            for account in accounts:
                if account.get('@type') != 'User': continue
                self.syncAccount(connection, account)
            lastSyncTime, syncError = int(time.time()), None
        except Exception:
            syncError = '邮件元数据采集失败；已保存的历史记录仍可查看。'
        finally:
            connection.close(); running = False; syncLock.release()

    def syncAccount(self, connection, account):
        accountId = account['id']
        folderList = self.call('Mailbox/get', {'accountId': accountId, 'ids': None,
            'properties': ['id', 'name', 'role']}).get('list', [])
        folders = {x['id']: {'name': x.get('name', ''), 'role': x.get('role')} for x in folderList}
        cursor = connection.execute('SELECT state FROM mail_sync_state WHERE id = ?', (accountId,)).fetchone()
        state = cursor[0] if cursor else None
        if state:
            try:
                changes = self.call('Email/changes', {'accountId': accountId, 'sinceState': state, 'maxChanges': 500})
            except RuntimeError:
                state = None
        if not state:
            state = self.call('Email/get', {'accountId': accountId, 'ids': [], 'properties': ['id']})['state']
            position = 0
            while True:
                ids = self.call('Email/query', {'accountId': accountId, 'position': position, 'limit': 500,
                    'sort': [{'property': 'receivedAt', 'isAscending': False}],
                    'filter': {'after': datetime.fromtimestamp(time.time() - RETENTION_SECONDS,
                        tz=timezone.utc).isoformat()}}).get('ids', [])
                self.capture(connection, account, folders, ids)
                position += len(ids)
                if len(ids) < 500: break
        else:
            while True:
                self.capture(connection, account, folders, list(dict.fromkeys(changes['created'] + changes['updated'])))
                state = changes['newState']
                if not changes['hasMoreChanges']: break
                changes = self.call('Email/changes', {'accountId': accountId, 'sinceState': state, 'maxChanges': 500})
        with connection:
            connection.execute('INSERT INTO mail_sync_state(id,state,updated_time) VALUES(?,?,?) '
                'ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_time=excluded.updated_time',
                (accountId, state, int(time.time())))

    def capture(self, connection, account, folders, ids):
        for offset in range(0, len(ids), 100):
            messages = self.call('Email/get', {'accountId': account['id'], 'ids': ids[offset:offset + 100],
                'properties': ['id', 'subject', 'from', 'to', 'cc', 'receivedAt', 'sentAt', 'messageId',
                               'size', 'mailboxIds', 'keywords']}).get('list', [])
            storeMessages(connection, account, folders, messages, int(time.time()))

    def run(self):
        while True:
            self.sync()
            time.sleep(30)
