# AI 本地代理（w6 精简版）：只留 /chat 一个接口
# 端口：5000
# 接口：
#   POST /chat  { userText, contextText } -> { reply }
# 精简：无思考模式、无一键关闭、无路由开关（固定走 local_txt 直连 DeepSeek）

import json
from http.server import HTTPServer, BaseHTTPRequestHandler

from local_txt.deepseek_direct import call_chat

ALLOWED_ORIGINS = {
    'http://localhost:8080',
    'http://127.0.0.1:8080',
}


class Handler(BaseHTTPRequestHandler):
    def _set_cors(self, status=200, content_type='application/json'):
        origin = self.headers.get('Origin')
        self.send_response(status)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_cors(204)

    def do_POST(self):
        if self.path != '/chat':
            self._set_cors(404)
            self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))
            return

        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length) if length else b'{}'
            body = json.loads(raw.decode('utf-8'))
            user_text = body.get('userText', '')
            context_text = body.get('contextText', '')

            reply = call_chat(user_text, context_text)
            self._set_cors(200)
            self.wfile.write(json.dumps({'reply': reply}, ensure_ascii=False).encode('utf-8'))
        except Exception as e:
            self._set_cors(500)
            self.wfile.write(json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8'))

    # 静默：不打印每一条 GET/POST 日志
    def log_message(self, format, *args):
        pass


def main():
    host = '127.0.0.1'
    port = 5000
    print(f'[AI Proxy] 启动中：{host}:{port}')
    HTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
