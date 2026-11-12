// AI 对话框 ↔ 节点 content 双向同步
// 职责：
//   1. 把节点 content 解析成消息列表（按行首前缀切分）
//   2. 把新消息追加到 content，并同步到节点 DOM
// 对话记录格式（存于 node.content，每条消息独占一行，前缀在行首）：
//   user：用户消息1
//   ai：AI回复1
//   user：用户消息2
//   ai：AI回复2
// 写入规则：追加 user/ai 前必先回车（_append 已保证前缀在行首）
// 兼容解析：user:/user：/ai:/ai：/（回答）： 均能识别（冒号后可选空格）

// 写入前缀（全角冒号）
const USER_PREFIX = 'user：';

// HTML 转义：innerHTML 写入前转义，防 XSS 和标签错乱
function _escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 解析用的前缀匹配（兼容历史格式：半角/全角冒号、（回答）：旧前缀、模型名前缀）
// 冒号后可选空格，匹配到的行作为新消息起点
const PARSE_PREFIXES = [
  { role: 'user', regex: /^user[：:]\s?/ },
  { role: 'ai', regex: /^ai[：:]\s?/ },
  { role: 'ai', regex: /^（回答）[：:]\s?/ },
  { role: 'ai', regex: /^deepseek-[a-z0-9._-]+[：:]\s?/i },
];

export class AIChatSync {
  constructor(nodeManager) {
    this.nodeManager = nodeManager;
    this.uid = null;
    this.node = null;
  }

  // 绑定到某节点
  attach(uid) {
    this.uid = uid;
    this.node = this.nodeManager.nodes.get(uid);
  }

  // 解绑
  detach() {
    this.uid = null;
    this.node = null;
  }

  // 把节点 content 解析成消息数组 [{role: 'user'|'ai', text}]
  // 规则：以 "user: " 或 "ai: " 开头的行作为新消息起点，后续非前缀行作为该消息的续行
  // 兼容：content 完全没有前缀时，整段当作一条 user 消息（老笔记）
  getMessages() {
    if (!this.node || !this.node.content) return [];
    const lines = this.node.content.split('\n');
    const messages = [];
    let current = null;
    for (const line of lines) {
      // 匹配行首前缀（兼容 user:/user：/ai:/ai：/（回答）：）
      let matched = null;
      for (const p of PARSE_PREFIXES) {
        if (p.regex.test(line)) { matched = p; break; }
      }
      if (matched) {
        if (current) messages.push(current);
        current = { role: matched.role, text: line.replace(matched.regex, '') };
      } else {
        // 续行：追加到当前消息（支持多行消息）
        if (current) {
          current.text += '\n' + line;
        } else if (line.trim()) {
          // 老笔记无前缀，整段当 user 消息
          current = { role: 'user', text: line };
        }
      }
    }
    if (current) messages.push(current);
    return messages;
  }

  // 追加用户消息
  appendUserMessage(text) {
    this._append(USER_PREFIX + text);
  }

  // 追加 AI 消息（后端已带模型名前缀，不再加 AI_PREFIX）
  appendAIMessage(text) {
    this._append(text);
  }

  _append(line) {
    if (!this.node) return;
    const content = this.node.content || '';
    const sep = content && !content.endsWith('\n') ? '\n' : '';
    this.node.content = content + sep + line;
    this._syncToNodeDom();
    this.nodeManager.onNodeChange?.();
  }

  // 同步到节点 DOM 的 contentEditable 区
  // 模型名前缀（如 deepseek-v4-flash-vision-exp：）用 <span class="ai-model-prefix"> 包裹以独立样式
  // 注意：这里用 innerHTML 只在程序同步时触发；用户手动编辑时浏览器 contentEditable 会自然维护 HTML 结构
  _syncToNodeDom() {
    const el = this.nodeManager.nodeLayer.querySelector(
      `[data-uid="${this.uid}"] .node-content`
    );
    if (!el) return;
    const text = this.node.content || '';
    // 逐行处理：模型名前缀 → span 包裹；其余行原样
    const lines = text.split('\n');
    const html = lines.map(line => {
      const m = line.match(/^(deepseek-[a-z0-9._-]+)[：:](.*)$/i);
      if (m) {
        const prefix = m[1];
        const rest = m[2];
        return `<span class="ai-model-prefix">${prefix}：</span>${_escapeHtml(rest)}`;
      }
      return _escapeHtml(line);
    }).join('\n');
    el.innerHTML = html;
  }
}
