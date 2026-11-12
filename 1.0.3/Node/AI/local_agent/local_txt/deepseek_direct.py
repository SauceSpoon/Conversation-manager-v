# 本地 TXT 路径（w6 精简版）：直接从 api_key.txt 读 Key + 直连 DeepSeek API
# 暴露函数：call_chat(user_text, context_text) -> reply str
# 精简：无附件、无仓库文件读取、无思考模式，纯文本对话
import json
import os
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # local_txt 目录
API_KEY_FILE = os.path.join(BASE_DIR, 'api_key.txt')
API_BASE_URL = 'https://api.deepseek.com/chat/completions'
MODEL = 'deepseek-flash'
SYSTEM_PROMPT = '你是我的ai助手，每次输出限制在2000字内。'


def load_api_key():
    with open(API_KEY_FILE, 'r', encoding='utf-8') as f:
        return f.read().strip()


def call_chat(user_text, context_text):
    """代理层唯一调用点：返回回复文本，异常直接 raise。
       返回格式：'{MODEL}：{content}'（全角冒号，与 user： 一致，前端按行首前缀解析）"""
    api_key = load_api_key()

    full_text = f'{context_text}\n\n当前问题：{user_text}' if context_text else user_text
    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': full_text},
        ],
        'stream': False,
    }

    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        API_BASE_URL,
        data=data,
        method='POST',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        body = json.loads(resp.read().decode('utf-8'))
    content = body['choices'][0]['message'].get('content', '')
    return f'{MODEL}：{content}'
