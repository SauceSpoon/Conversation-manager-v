// 数学公式渲染模块（KaTeX 本地库）
// 职责：
//   1. 把元素内的 LaTeX 文本（\(..\)、\[..\]、$..$、$$..$$）渲染成公式
//   2. 节点渲染态管理：进入/退出渲染模式（contentEditable 切换 + 公式渲染）
// 边界：只操作显示层 DOM，不读写 node.content（数据仍由 ai_chat_sync / node_manager 维护）
//       节点存档始终是纯文本（LaTeX 源码），渲染只是显示效果，切换/重启都不丢数据

// 支持的定界符（顺序即匹配优先级：块级在前，避免 $$ 被 $ 拆开）
const DELIMITERS = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
];

// HTML 转义（与 ai_chat_sync 同规则：innerHTML 写入前转义，防 XSS 和标签错乱）
function _escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 节点 content 纯文本 → 显示用 HTML
// 模型名前缀（如 deepseek-v4-flash：）用 <span class="ai-model-prefix"> 包裹以独立样式，其余行转义原样
export function buildContentHtml(text) {
  const lines = String(text ?? '').split('\n');
  return lines.map(line => {
    const m = line.match(/^(deepseek-[a-z0-9._-]+)[：:](.*)$/i);
    if (m) {
      return `<span class="ai-model-prefix">${m[1]}：</span>${_escapeHtml(m[2])}`;
    }
    return _escapeHtml(line);
  }).join('\n');
}

// 在元素内渲染 LaTeX（window.renderMathInElement 由 contrib/auto-render.min.js 提供）
// 解析失败的片段保持原文本（throwOnError: false），不会丢内容
export function renderMath(el) {
  if (typeof window.renderMathInElement !== 'function') return;
  window.renderMathInElement(el, {
    delimiters: DELIMITERS,
    throwOnError: false,
  });
}

// 节点是否处于渲染态（class 挂在 .canvas-node 上）
export function isMathMode(nodeEl) {
  return !!nodeEl && nodeEl.classList.contains('math-mode');
}

// 进入渲染态：内容不可编辑，按 HTML 结构 + KaTeX 公式显示
export function enterMathMode(nodeEl, contentEl, text) {
  nodeEl.classList.add('math-mode');
  contentEl.contentEditable = 'false';
  contentEl.classList.add('math-rendered');
  contentEl.innerHTML = buildContentHtml(text);
  renderMath(contentEl);
}

// 退出渲染态：恢复纯文本可编辑（textContent 直接回填源码）
export function exitMathMode(nodeEl, contentEl, text) {
  nodeEl.classList.remove('math-mode');
  contentEl.contentEditable = 'true';
  contentEl.classList.remove('math-rendered');
  contentEl.textContent = text;
}

// 渲染态下的内容刷新（AI 追加消息后由 ai_chat_sync._syncToNodeDom 调用）
// 非渲染态不动 DOM（编辑中的 contentEditable 由浏览器自己维护）
export function rerenderIfMathMode(nodeEl, contentEl, text) {
  if (!isMathMode(nodeEl)) return;
  contentEl.innerHTML = buildContentHtml(text);
  renderMath(contentEl);
}

// 默认渲染态：内容非空且用户没在编辑 → 自动进渲染态
// 用于三类时机：节点创建/恢复（_renderNode）、内容失焦（blur）、AI 追加消息（_syncToNodeDom）
// 用户正在编辑（焦点在 content 内）不抢；空节点保持编辑态（否则新建节点无法输入）
export function ensureMathMode(nodeEl, contentEl, text) {
  if (isMathMode(nodeEl)) return;
  if (!text || !String(text).trim()) return;
  const active = document.activeElement;
  if (active && contentEl.contains(active)) return;
  enterMathMode(nodeEl, contentEl, text);
}
