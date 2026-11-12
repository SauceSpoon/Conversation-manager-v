# AI 本地代理（路由层）：只留 HTTP Handler + 路径分发
# 端口：5000
# 接口：
#   POST /chat      { userText, contextText, attachments? } -> { reply }
#   POST /thinking  { enabled, effort? } -> { ok, state }   写入思考模式状态
#   GET  /thinking  -> { state: { enabled, effort } }        回读当前思考状态
#   POST /shutdown -> 异步杀 8080 前端 + 5000 自杀
#
# 路由策略（通过 USE_TXT_API 布尔开关切换，默认 True = 走 TXT 路径）：
#   USE_TXT_API=True   -> local_txt/deepseek_direct.py（读 api_key.txt + 直连 DeepSeek）
#   USE_TXT_API=False  -> API 平台路径（先占位 NotImplemented，接好 platform_adapter 再实现）
#
# ⭐ 改法：以后把 USE_TXT_API 改 False 就能切到平台路径，路由层代码完全不用动

import json
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

import thinking_config
from Close_backend_process.close_backend_process import shutdown_all
from local_txt.deepseek_direct import call_chat as call_txt_chat

# ======== 全局开关：切调用路径 ========
USE_TXT_API = True   # True=走本地 txt Key 路径；False=走 API 平台（先占位未实现）

ALLOWED_ORIGINS = {
    'http://localhost:8080',
    'http://127.0.0.1:8080',
}


def dispatch_chat(user_text, context_text, attachments):
    """唯一调用入口：按布尔开关决定走哪条路，返回 reply 字符串，异常直接 raise"""
    if USE_TXT_API:
        # 路径 1：读 api_key.txt 直连 DeepSeek（已实现）
        return call_txt_chat(user_text, context_text, attachments)
    else:
        # 路径 2：API 平台统一调用（接好再实现）
        raise NotImplementedError(
            'API 平台路径未接入：请先在 local_agent/ 下填 platform_adapter，再把 USE_TXT_API 改为 False'
        )


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

    def do_GET(self):
        # 回读思考模式状态（前端刷新页面后对齐指示灯）
        if self.path == '/thinking':
            self._set_cors(200)
            self.wfile.write(json.dumps(
                {'state': thinking_config.get_thinking()}, ensure_ascii=False
            ).encode('utf-8'))
            return
        self._set_cors(404)
        self.wfile.write(json.dumps({'error': 'Not Found'}).encode('utf-8'))

    def do_POST(self):
        # 一键关闭：发响应后异步 shutdown_all
        if self.path == '/shutdown':
            self._set_cors(200)
            self.wfile.write(json.dumps({'ok': True}, ensure_ascii=False).encode('utf-8'))
            threading.Thread(target=shutdown_all, daemon=True).start()
            return

        # 思考模式状态写入：只改 thinking_config 内存，与 /chat 完全独立
        if self.path == '/thinking':
            try:
                length = int(self.headers.get('Content-Length', 0))
                raw = self.rfile.read(length) if length else b'{}'
                body = json.loads(raw.decode('utf-8'))
                state = thinking_config.set_thinking(
                    body.get('enabled', False),
                    body.get('effort'),
                )
                self._set_cors(200)
                self.wfile.write(json.dumps(
                    {'ok': True, 'state': state}, ensure_ascii=False
                ).encode('utf-8'))
            except Exception as e:
                self._set_cors(500)
                self.wfile.write(json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8'))
            return

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
            attachments = body.get('attachments', []) or []

            reply = dispatch_chat(user_text, context_text, attachments)
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
    print(f'[AI Proxy] 当前路径：{"TXT 直连 DeepSeek" if USE_TXT_API else "API 平台（未接）"}')
    HTTPServer((host, port), Handler).serve_forever()


if __name__ == '__main__':
    main()
