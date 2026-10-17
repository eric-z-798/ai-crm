"""HTTP integration checks on ephemeral loopback server + new synthetic SQLite per test."""
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from crm.app import create_server


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.server=create_server(self.tmp.name+'/http.sqlite',port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.port=self.server.server_port

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()

    def req(self,path='/api/v1/context',method='GET',body=None,headers=None,auth=True):
        conn=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        hdr={'Authorization':'Bearer demo-rep-a'} if auth else {}
        if body is not None:hdr['Content-Type']='application/json';body=json.dumps(body)
        hdr.update(headers or {})
        conn.request(method,path,body,headers=hdr)
        res=conn.getresponse();raw=res.read();mime=res.getheader('Content-Type');status=res.status;response_headers=dict(res.getheaders());conn.close()
        return status,json.loads(raw) if mime and 'json' in mime else raw,response_headers

    def test_context_truthful_capabilities(self):
        code,c,_=self.req()
        self.assertEqual(code,200);self.assertEqual(c['runtimeLevel'],'prototype');self.assertEqual(c['persistence'],'sqlite')
        self.assertEqual(c['businessPurpose'],'COMMERCIAL');self.assertFalse(c['capabilities']['databaseRlsVerified']);self.assertFalse(c['capabilities']['autoPolicyExecution'])
        self.assertEqual(c['ai']['mode'],'stub');self.assertFalse(c['ai']['externalCallsEnabled'])

    def test_health_and_static_assets(self):
        for path in ['/health/live','/health/ready','/','/app.js','/style.css']:
            with self.subTest(path=path):
                code,body,headers=self.req(path,auth=False);self.assertEqual(code,200);self.assertIn('Content-Security-Policy',headers)
        _,html,_=self.req('/',auth=False);self.assertIn('模拟 AI'.encode(),html);self.assertNotIn(b'https://',html)
        _,js,_=self.req('/app.js',auth=False);self.assertNotIn(b'innerHTML',js);self.assertNotIn(b'eval(',js)

    def test_authentication_and_identity_cannot_be_header_spoofed(self):
        self.assertEqual(self.req(auth=False)[0],401)
        self.assertEqual(self.req(headers={'Authorization':'Bearer nope'})[0],401)
        self.assertEqual(self.req('/api/v1/hcos/hco-b',headers={'X-Tenant-Id':'tenant-b','X-User-Id':'rep-b'})[0],404)

    def test_host_origin_and_cors_fail_closed(self):
        self.assertEqual(self.req(headers={'Host':'attacker.invalid'})[0],403)
        self.assertEqual(self.req(headers={'Origin':'https://attacker.invalid'})[0],403)
        _,_,headers=self.req(headers={'Origin':f'http://127.0.0.1:{self.port}'})
        self.assertNotIn('Access-Control-Allow-Origin',headers)

    def test_http_full_flow_and_idempotency(self):
        code,r,_=self.req('/api/v1/missions/mission-a/runs','POST',{'visitId':'visit-a'},{'Idempotency-Key':'http-run-1'})
        self.assertEqual(code,201);p=r['plan'];self.assertEqual(self.req('/api/v1/tasks')[1]['total'],0)
        body={'planHash':p['planHash'],'actionIds':[p['actions'][0]['id']]}
        code,r,headers=self.req('/api/v1/ai/plans/'+p['id']+'/confirm','POST',body,{'Idempotency-Key':'http-confirm-1'})
        self.assertEqual(code,201);self.assertIn('X-Request-Id',headers);self.assertEqual(len(r['receipt']['taskIds']),1)
        code,repeat,_=self.req('/api/v1/ai/plans/'+p['id']+'/confirm','POST',body,{'Idempotency-Key':'http-confirm-2'})
        self.assertEqual(code,200);self.assertTrue(repeat['replayed']);self.assertEqual(self.req('/api/v1/tasks')[1]['total'],1)

    def test_malformed_body_and_id_report_400(self):
        for value in [None,False,[],{},1]:
            code,error,_=self.req('/api/v1/ai/plans','POST',{'missionId':value,'visitId':'visit-a'},{'Idempotency-Key':'fuzz-key-'+str(value)})
            self.assertEqual(code,400);self.assertNotIn('Traceback',json.dumps(error));self.assertNotIn('SELECT ',json.dumps(error))

    def test_missing_idempotency_and_schema(self):
        code,error,_=self.req('/api/v1/ai/plans','POST',{'missionId':'mission-a','visitId':'visit-a'})
        self.assertEqual(code,400);self.assertEqual(error['code'],'IDEMPOTENCY_KEY_REQUIRED')
        code,error,_=self.req('/api/v1/ai/plans','POST',{'missionId':'mission-a','visitId':'visit-a','role':'admin'},{'Idempotency-Key':'invalid-schema'})
        self.assertEqual(code,400);self.assertEqual(error['code'],'INVALID_SCHEMA')

    def test_pagination_is_authorized_and_bounded(self):
        code,data,_=self.req('/api/v1/hcos?limit=1');self.assertEqual(code,200);self.assertEqual(data['total'],1);self.assertIsNone(data['nextCursor'])
        self.assertEqual(self.req('/api/v1/hcos?limit=101')[0],400)
        self.assertEqual(self.req('/api/v1/hcos?cursor=-1')[0],400)
        self.assertEqual(self.req('/api/v1/hcos?search=%E5%8D%97%E6%B9%BE')[1]['total'],0)

    def test_prod_real_models_fail_startup_private_demo_same_core(self):
        with self.assertRaises(ValueError):create_server(self.tmp.name+'/prod.sqlite',0,'prod')
        with patch.dict(os.environ,{'AI_PROVIDER_MODE':'live'}):
            with self.assertRaises(ValueError):create_server(self.tmp.name+'/live.sqlite',0)
        private=create_server(self.tmp.name+'/private.sqlite',0,'private-demo')
        try:
            self.assertTrue(all(x['tenantId']=='tenant-a' for x in private.crm.identities()))
            from crm.domain import DomainError
            with self.assertRaises(DomainError):private.crm.bootstrap('demo-rep-b')
        finally:private.server_close()

    def test_unsupported_capability_never_fake_success(self):
        for path in ['/api/v1/send-email','/api/v1/missions/mission-a/outcomes','/api/v1/agent-runs/run-any/cancel']:
            code,r,_=self.req(path,'POST',{}, {'Idempotency-Key':'unsupported-123'})
            self.assertEqual(code,501);self.assertEqual(r['code'],'CAPABILITY_NOT_IMPLEMENTED')


if __name__=='__main__':unittest.main()
