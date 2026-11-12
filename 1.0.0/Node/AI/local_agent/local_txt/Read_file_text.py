# Read_file_text：扫描对话上下文里的 [[文件名]] 标记，从 Node/File_warehouse 读出文本并出报告
# 职责边界（到此为止）：
#   1. 只负责"找标记 → 读文件 → 生成报告字符串"
#   2. 不负责拼接/发送：由 deepseek_direct.py 在发给 DeepSeek 前调用，报告拼到 contextText 末尾
#   3. 只读不写：提取结果即用即弃，不落 JSON / 不缓存，下次请求实时读盘
# 防呆：任何异常都降级为占位文本，永不 raise（文件问题不能中断对话）
import os
import re
import sys

# ======== 布尔开关：False 时 read_file_text 直接返回 None（上下文原样发给 AI） ========
ENABLE_READ_FILE_TEXT = True

BASE_DIR = os.path.dirname(os.path.abspath(__file__))        # local_txt 目录
# local_txt → local_agent → AI → Node（三级）→ File_warehouse
WAREHOUSE_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', '..', '..', 'File_warehouse'))
# local_txt → ... → UI（四级）→ lib（pypdf 装在这里，随项目自包含）
LIB_DIR = os.path.normpath(os.path.join(BASE_DIR, '..', '..', '..', '..', 'lib'))
if os.path.isdir(LIB_DIR):
    sys.path.insert(0, LIB_DIR)

MARKER_RE = re.compile(r'\[\[([^\[\]]+?)\]\]')   # [[文件名]]，非贪婪，不允许嵌套括号
MAX_CHARS_PER_FILE = 20000                        # 单文件提取上限，防撑爆 token


# ---------- 标记清洗：去空白/引号，只取 basename，拒绝路径成分（防穿越） ----------
def _clean_name(raw):
    name = (raw or '').strip().strip('"').strip("'").strip()
    name = os.path.basename(name.replace('\\', '/'))
    if name in ('', '.', '..'):
        return None
    return name


# ---------- PDF 提取：pypdf 逐页提取，扫描页/缺库/损坏全部降级为占位 ----------
def _extract_pdf(path):
    try:
        from pypdf import PdfReader
    except Exception:
        return '[PDF 文本提取库（pypdf）未安装，无法读取内容]'
    try:
        reader = PdfReader(path)
    except Exception as e:
        return f'[PDF 打开失败：{e}]'
    parts = []
    total = 0
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or '').strip()
        except Exception:
            text = ''
        if not text:
            parts.append(f'[第{i}页为图片/扫描页，当前无法识别]')
            continue
        if total + len(text) > MAX_CHARS_PER_FILE:
            parts.append(f'[内容过长，第{i}页起已截断]')
            break
        parts.append(f'第{i}页：\n{text}')
        total += len(text)
    return '\n'.join(parts) if parts else '[PDF 未提取到任何文本]'


# ---------- 单个文件 → 报告正文（不含 [[name]] 前缀）；永不 raise ----------
def _read_one(name):
    ext = os.path.splitext(name)[1].lower()
    path = os.path.join(WAREHOUSE_DIR, name)
    if ext == '.png':
        # png 没有文字层，也要向 AI 报告，而不是沉默
        return '[图片文件，无可提取文本]'
    if not os.path.isfile(path):
        return '[文件不存在，可能已被移动或删除]'
    if ext == '.pdf':
        return _extract_pdf(path)
    if ext == '.doc':
        # 老 doc 二进制格式纯 Python 难读，先占位，以后可上 Word COM
        return '[doc 暂不支持文本提取，建议转 pdf]'
    return f'[.{ext[1:] or "?"} 类型不支持文本提取]'


# ---------- 对外唯一入口 ----------
def read_file_text(context_text='', user_text=''):
    """扫描 contextText / userText 中的 [[文件名]] 标记，返回报告字符串。
       开关关闭、无标记 → 返回 None（调用方照原样发送）。"""
    if not ENABLE_READ_FILE_TEXT:
        return None
    haystack = f'{context_text or ""}\n{user_text or ""}'
    # 清洗 + 去重（同一文件被多个节点引用只报告一次），保持出现顺序
    names = []
    for m in MARKER_RE.finditer(haystack):
        name = _clean_name(m.group(1))
        if name and name not in names:
            names.append(name)
    if not names:
        return None

    lines = ['───── 以下是对话中引用的文件内容 ─────']
    for name in names:
        try:
            body = _read_one(name)
        except Exception as e:
            body = f'[文件读取异常：{e}]'
        lines.append(f'[[{name}]]的内容是：\n{body}')
    return '\n\n'.join(lines)
