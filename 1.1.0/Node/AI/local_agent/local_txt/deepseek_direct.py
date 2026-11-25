# 本地 TXT 路径：直接从 api_key.txt 读 Key + 直连 DeepSeek API
# 用途：当 USE_TXT_API = True 时走这里（当前默认）
# 暴露函数：call_chat(user_text, context_text, attachments) -> reply str
# 说明：把原来 ai_proxy.py 里发请求的逻辑完整搬到这里，行为 1:1 等于旧版
import json
import os
import urllib.request
import urllib.error

# 同包导入：包内运行走相对导入，直接脚本运行退回绝对导入
try:
    from .Read_file_text import read_file_text
    from .Read_picture import read_picture
except ImportError:
    from Read_file_text import read_file_text
    from Read_picture import read_picture

# 思考模式状态（父目录 local_agent/thinking_config.py）
# ai_proxy.py 启动时 sys.path 含 local_agent，脚本直跑也退回绝对导入
try:
    from .. import thinking_config
except ImportError:
    import thinking_config

# 思维链分隔符：后端拼 reasoning + content，前端按此拆分
# 六个全角等号 + 换行，正常回复不会出现
REASONING_SEPARATOR = '\n══════\n'
REASONING_PREFIX = '[思考] '

BASE_DIR = os.path.dirname(os.path.abspath(__file__))  # local_txt 目录
API_KEY_FILE = os.path.join(BASE_DIR, 'api_key.txt')
API_BASE_URL = 'https://api.deepseek.com/chat/completions'
#https://api.deepseek.com/v1/chat/completions
MODEL = 'deepseek-flash'
SYSTEM_PROMPT = '你是我的ai助手，每次输出限制在2000字内。'


def load_api_key():
    with open(API_KEY_FILE, 'r', encoding='utf-8') as f:
        return f.read().strip()


def build_user_content(user_text, context_text, attachments, warehouse_images=None):
    """构造 content 数组：
       - 文本部分（上下文 + 问题）
       - 仓库 [[标记]] 提取的图片 → image_url（视觉模型，Read_picture 产出）
       - 图片附件 → image_url 字段
       - 非图片附件（PDF 等）：当前无前端预处理文字，先提示未提取（以后在后端 process_attachment 补）
    """
    full_text = f'{context_text}\n\n当前问题：{user_text}' if context_text else user_text
    content = [{'type': 'text', 'text': full_text}]
    # 仓库 [[文件名]] 提取的图片（先文字后图片，模型先读上下文再看图）
    for img in warehouse_images or []:
        content.append({
            'type': 'image_url',
            'image_url': {'url': img['data_url']}
        })
    for att in attachments or []:
        name = att.get('name', '附件')
        mime = att.get('type', '')
        b64 = att.get('base64', '')
        text = att.get('text', '')
        if mime.startswith('image/'):
            if b64:
                content.append({
                    'type': 'image_url',
                    'image_url': {'url': b64}
                })
        else:
            if text:
                content.append({
                    'type': 'text',
                    'text': f'[附件 {name} 的内容]\n{text}'
                })
            else:
                content.append({
                    'type': 'text',
                    'text': f'[附件: {name}]（未能提取文字内容）'
                })
    return content


def call_deepseek(user_text, context_text, attachments):
    """直接请求 DeepSeek API，返回回复文本。"""
    api_key = load_api_key()

    # ① 图片提取：用原始上下文扫描（在文本报告拼接前，避免扫到报告里回显的 [[name]]）
    #    非视觉模型时 read_picture 内部自检 MODEL 返回 []，不影响纯文本路径
    warehouse_images = read_picture(context_text, user_text, MODEL)

    # ② 文本提取：扫描 [[文件名]] 标记，把仓库文件内容临时拼到上下文末尾
    #    有报告 → 追加；返回 None（开关关/无标记）→ 上下文原样发送
    report = read_file_text(context_text, user_text)
    if report:
        context_text = f'{context_text}\n\n{report}' if context_text else report

    user_content = build_user_content(user_text, context_text, attachments, warehouse_images)

    # 无任何图片（附件图片 + 仓库图片）时退回纯文本格式（兼容纯文本模型，更稳定）
    has_att_image = any(
        (att.get('type', '') or '').startswith('image/') and att.get('base64')
        for att in (attachments or [])
    )
    if not has_att_image and not warehouse_images:
        user_content = user_content[0]['text']

    payload = {
        'model': MODEL,
        'messages': [
            {'role': 'system', 'content': SYSTEM_PROMPT},
            {'role': 'user', 'content': user_content},
        ],
        'stream': False,
    }
    # 思考模式：merge thinking_config 的 OpenAI 参数（thinking/reasoning_effort）
    # 关闭时 to_openai_params 返回 {thinking: {type: disabled}}，DeepSeek 按无思考返回
    thinking_params = thinking_config.to_openai_params()
    payload.update(thinking_params)
    # [DEBUG] 临时打印：确认 thinking 参数进了 payload
    print(f'[DEBUG] thinking_params={thinking_params}')

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
    msg = body['choices'][0]['message']
    content = msg.get('content', '')
    reasoning = msg.get('reasoning_content', '') or ''
    # [DEBUG] 临时打印：确认 API 是否回 reasoning_content
    print(f'[DEBUG] thinking_config={thinking_config.get_thinking()}, has_reasoning={bool(reasoning)}, reason_len={len(reasoning)}, content_len={len(content)}')
    print(f'[DEBUG] msg keys={list(msg.keys())}')
    return content, reasoning


# ---------- 对外统一入口 ----------
def call_chat(user_text, context_text, attachments):
    """路由层唯一调用点：返回回复文本，异常直接 raise。
       返回格式：
         - 无思维链：'{MODEL}：{content}'（全角冒号，与 user： 一致）
         - 有思维链：'[思考] {reasoning}\\n══════\\n{MODEL}：{content}'
       前缀只在这里拼，不进 DeepSeek 请求体（避免模型读到自己的名字）
       思维链由 reasoning_content 字段产出，前端按分隔符拆分后渲染灰气泡，不进节点存储"""
    content, reasoning = call_deepseek(user_text, context_text, attachments)
    reply = f'{MODEL}：{content}'
    if reasoning:
        return f'{REASONING_PREFIX}{reasoning}{REASONING_SEPARATOR}{reply}'
    return reply
