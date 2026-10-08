import time
import unittest
from unittest.mock import patch, MagicMock
import history
import server

class HistoryTests(unittest.TestCase):
    def test_metadata_archive_deduplicates_and_excludes_body_and_drafts(self):
        db = server.openDatabase(':memory:'); now = int(time.time())
        account = {'id':'c','emailAddress':'inbox@example.test'}
        message = {'id':'m1','subject':'Example','from':[{'email':'sender@example.test'}], 'to':[{'email':'inbox@example.test'}], 'receivedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime(now)), 'mailboxIds':{'inbox':True}, 'bodyValues':{'secret':'do not store'}}
        history.storeMessages(db,account,{'inbox':{'name':'Inbox','role':'inbox'}},[message,{**message,'id':'draft','keywords':{'$draft':True}}],now)
        history.storeMessages(db,account,{'inbox':{'name':'Inbox','role':'inbox'}},[message],now+10)
        result=history.queryHistory(db,'received','sender@example.test',1)
        self.assertEqual(result['total'],1)
        record=result['items'][0]
        self.assertEqual(record['firstSeenTime'],now)
        self.assertEqual(record['updatedTime'],now+10)
        self.assertEqual(record['status'],'stored')
        self.assertNotIn('bodyValues',record)
        self.assertEqual(history.historyDetail(db,record['id']),record)
        self.assertEqual(history.queryHistory(db,'sent','',1)['total'],0)
        history.storeMessages(db,account,{'inbox':{'name':'Sent','role':'sent'}},[message],now+20)
        self.assertEqual(history.queryHistory(db,'sent','',1)['items'][0]['status'],'sentCopy')
        db.close()

    def test_mail_history_requires_both_cross_account_permissions(self):
        response=MagicMock(); response.__enter__.return_value=response
        required=frozenset({'impersonate','sysAccountGet'})
        with patch.object(server.HTTP,'open',return_value=response),patch.object(server.json,'load',return_value={'permissions':['sysMetricsGet','sysAccountGet']}):
            self.assertEqual(server.authorize('Bearer test',required),403)
        with patch.object(server.HTTP,'open',return_value=response),patch.object(server.json,'load',return_value={'permissions':['impersonate','sysAccountGet']}):
            self.assertEqual(server.authorize('Bearer test',required),200)

    def test_expired_metadata_is_not_exposed(self):
        db=server.openDatabase(':memory:'); now=int(time.time())
        history.storeMessages(db,{'id':'c'}, {},[{'id':'old','receivedAt':'2000-01-01T00:00:00Z'}],now)
        self.assertEqual(history.queryHistory(db,'all','',1)['total'],0)
        db.close()
