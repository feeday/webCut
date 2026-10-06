import http.client
import io
import json
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server

class Response(io.BytesIO):
    status = 200
    headers = {'Content-Type': 'application/json'}

class ProxyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.Server(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def request(self, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.httpd.server_address[1])
        conn.request('POST' if body is not None else 'GET', path, body=body, headers=headers or {})
        response = conn.getresponse()
        result = (response.status, response.read())
        conn.close()
        return result

    def test_status_and_reject_arbitrary_destinations(self):
        self.assertEqual(json.loads(self.request('/api/qwen/status')[1]), {'webcut_qwen_proxy': True})
        self.assertEqual(self.request('/api/qwen/https://example.com', b'x')[0], 404)
        self.assertFalse(server.allowed_qwen_path('/call/asr_inference/../../secret', 'GET'))

    def test_same_origin_and_size_limits(self):
        self.assertEqual(self.request('/api/qwen/upload', b'x')[0], 403)
        self.assertEqual(self.request('/api/qwen/upload', b'x', {'X-WebCut-ASR':'1', 'Origin':'https://other.example'})[0], 403)
        self.assertEqual(self.request('/api/qwen/upload', b'x', {'X-WebCut-ASR':'1', 'Content-Length':str(server.MAX_ASR_BODY+1)})[0], 413)

    def test_fixed_upstream_and_authorization(self):
        with patch.object(server.urllib.request, 'build_opener') as opener:
            opener.return_value.open.return_value = Response(b'["/tmp/file.wav"]')
            status, body = self.request('/api/qwen/upload', b'fixture', {'X-WebCut-ASR':'1','Authorization':'Bearer hf_test','Content-Type':'audio/wav'})
            self.assertEqual(status, 200)
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, server.QWEN_ORIGIN+'/gradio_api/upload')
            self.assertEqual(request.get_header('Authorization'), 'Bearer hf_test')
            self.assertEqual(request.data, b'fixture')

    def test_upstream_timeout_returns_clear_status(self):
        with patch.object(server.urllib.request, 'build_opener') as opener:
            opener.return_value.open.side_effect = TimeoutError()
            self.assertEqual(self.request('/api/qwen/upload', b'x', {'X-WebCut-ASR':'1'})[0], 502)

if __name__ == '__main__':
    unittest.main()
