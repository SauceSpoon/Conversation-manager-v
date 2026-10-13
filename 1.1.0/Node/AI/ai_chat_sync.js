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

import { buildContentHtml, rerenderIfMathMode, ensureMathMode, isMathMode } from '../render_node_visualization/math_renderer.js';

// 写入前缀（全角冒号）
const USER_PREFIX = 'user：';

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
  // HTML 结构（转义 + 模型名前缀 span）统一由 math_renderer.buildContentHtml 生成
  // 默认渲染态：渲染态 → 重渲染公式；编辑态 → 内容非空且未聚焦时自动进渲染态，否则原样同步
  _syncToNodeDom() {
    const el = this.nodeManager.nodeLayer.querySelector(
      `[data-uid="${this.uid}"] .node-content`
    );
    if (!el) return;
    const nodeEl = el.closest('.canvas-node');
    const text = this.node.content || '';
    if (isMathMode(nodeEl)) {
      rerenderIfMathMode(nodeEl, el, text);
    } else {
      ensureMathMode(nodeEl, el, text);
    }
    if (!el.classList.contains('math-rendered')) {
      el.innerHTML = buildContentHtml(text);
    }
  }
}
