# Read_picture：扫描对话上下文里的 [[文件名]] 标记，从 Node/File_warehouse 读出图片转 base64
# 职责边界（到此为止）：
#   1. 只负责"找标记 → 判图片 → 读文件 → 转 base64 data URL"
#   2. 不负责拼接/发送：由 deepseek_direct.py 在发请求前调用，图片塞进 content 的 image_url
#   3. 只读纯图片文件（png/jpg/jpeg/gif/webp），不读 PDF 内置图片（以后再说）
#   4. 非视觉模型直接返回空列表（自我终止，不报错）
# 防呆：任何异常都跳过该文件，永不 raise（图片问题不能中断对话）
import base64
import os
import re

# ======== 布尔开关：False 时 read_picture 直接返回 [] ========
ENABLE_READ_PICTURE = True

# 视觉模型判定：deepseek- 开头的模型都支持视觉（flash 集成了所有能力）
# 规则放这里一处维护，以后 DeepSeek 改名字改这一行就行
VISION_MODEL_PREFIX = 'deepseek-'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))        # local_txt 目录
# local_txt → local_agent → AI → Node（三级）→ File_warehouse
WAREHOUSE_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', '..', '..', 'File_warehouse'))

MARKER_RE = re.compile(r'\[\[([^\[\]]+?)\]\]')   # [[文件名]]，非贪婪，不允许嵌套括号
IMAGE_EXT_MIME = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024   # 单图 5MB 上限，防 base64 撑爆请求体


# ---------- 标记清洗：去空白/引号，只取 basename，拒绝路径成分（防穿越） ----------
def _clean_name(raw):
    name = (raw or '').strip().strip('"').strip("'").strip()
    name = os.path.basename(name.replace('\\', '/'))
    if name in ('', '.', '..'):
        return None
    return name


# ---------- 单个图片 → data URL；非图片/不存在/超限/异常 → None（跳过，什么都不讲） ----------
def _read_one_image(name):
    ext = os.path.splitext(name)[1].lower()
    mime = IMAGE_EXT_MIME.get(ext)
    if not mime:
        return None                      # 非图片后缀：不处理
    path = os.path.join(WAREHOUSE_DIR, name)
    if not os.path.isfile(path):
        return None                      # 文件不存在：静默跳过
    try:
        if os.path.getsize(path) > MAX_IMAGE_BYTES:
            return None                  # 超大图：跳过（不发，避免请求体爆炸）
        with open(path, 'rb') as f:
            raw = f.read()
        b64 = base64.b64encode(raw).decode('ascii')
        return f'data:{mime};base64,{b64}'
    except Exception:
        return None                      # 读取异常：静默跳过


# ---------- 对外唯一入口 ----------
def read_picture(context_text='', user_text='', model=''):
    """扫描 contextText / userText 中的 [[文件名]] 标记，返回图片列表 [{name, data_url}]。
       开关关、非视觉模型、无图片标记 → 返回 []（调用方无图可拼，不报错）。"""
    if not ENABLE_READ_PICTURE:
        return []
    if not (model or '').lower().startswith(VISION_MODEL_PREFIX):
        return []                        # 非 deepseek 模型：自我终止
    haystack = f'{context_text or ""}\n{user_text or ""}'
    # 清洗 + 去重（同一文件被多个节点引用只读一次），保持出现顺序
    names = []
    for m in MARKER_RE.finditer(haystack):
        name = _clean_name(m.group(1))
        if name and name not in names:
            names.append(name)
    if not names:
        return []

    images = []
    for name in names:
        data_url = _read_one_image(name)
        if data_url:
            images.append({'name': name, 'data_url': data_url})
    return images
