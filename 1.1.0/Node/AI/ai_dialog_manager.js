// AI 自由对话框管理器
// 职责：
//   1. 点击节点弹出浮动对话框，一次只开一个，点别的节点切换
//   2. 对话框可拖动、可缩放
//   3. 发送消息时通过 onSend 回调交给 ai_client
//   4. 节点文本框手动编辑时，对话框自动同步刷新（双向）
//   5. 附件与节点 uid 绑定，持久化到 IndexedDB，每次对话自动带上
// 边界：不直接调 AI（靠 onSend 回调），不直接操作节点 content（通过 AIChatSync）
import { AIChatSync } from './ai_chat_sync.js';
import { FreeDialogBox } from './free_dialog_box.js';
import { ProxySwitch } from './proxy_switch.js';
import { FileFacade } from './file_handler/file_facade.js';
import { renderMath } from '../render_node_visualization/math_renderer.js';
import { syncThinking, fetchThinking } from './ai_client.js';

export class AIDialogManager {
  constructor(nodeManager) {
    this.nodeManager = nodeManager;
    this.currentUid = null;
    this.chatSync = new AIChatSync(nodeManager);
    this.onSend = null;  // 注入：async (userText, contextText, attachments) => aiReplyText
    this._dragging = false;
    this._resizing = false;
    this._nodeInputListener = null;
    this.proxySwitch = new ProxySwitch();
    this.fileHandler = new FileFacade();
    this.freeBox = new FreeDialogBox();
    this.freeBox.onSubmit = (text) => this._handleSend(text);
    // 🧠 状态变化即推送到后端 thinking_config（独立于 /chat；失败静默不阻塞对话）
    this.freeBox.onThinkingChange = (config) => {
      syncThinking(config).catch(() => {});
    };
    this._buildDom();
    this._bindDrag();
    this._bindResize();
    this._bindClose();
    this._bindToggleKey();
    // 回读后端思考状态对齐指示灯（代理离线时保持默认灭灯）
    this._syncThinkingFromBackend();
  }

  async _syncThinkingFromBackend() {
    try {
      const state = await fetchThinking();
      this.freeBox.applyThinkingConfig(state);
    } catch (e) {
      // 代理未启动：保持前端默认状态，不打扰用户
    }
  }

  _buildDom() {
    const el = document.createElement('div');
    el.className = 'ai-dialog';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="ai-dialog-header">
        <span class="ai-dialog-title">AI 对话</span>
        <div class="ai-dialog-header-right"></div>
        <button class="ai-dialog-close" title="关闭">×</button>
      </div>
      <div class="ai-dialog-messages"></div>
      <div class="ai-dialog-resizer" title="拖动调整大小"></div>
    `;
    document.body.appendChild(el);
    this.el = el;
    this.titleEl = el.querySelector('.ai-dialog-title');
    this.headerRight = el.querySelector('.ai-dialog-header-right');
    this.messagesEl = el.querySelector('.ai-dialog-messages');
    this.closeBtn = el.querySelector('.ai-dialog-close');
    this.resizerEl = el.querySelector('.ai-dialog-resizer');
    this.headerRight.appendChild(this.proxySwitch.getElement());
    this.fileHandler.mount(this.freeBox.getAttachMount());
    this.el.insertBefore(this.freeBox.getRootElement(), this.resizerEl);
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), true);
  }

  // 为某节点弹出对话框（已开则切换内容）
  async showForNode(uid) {
    this._detachNodeInputListener();

    this.currentUid = uid;
    this.chatSync.attach(uid);
    this.titleEl.textContent = `对话 ${uid.slice(0, 8)}`;
    this._renderMessages();
    this.freeBox.clear();

    // 绑定节点 → 从 IndexedDB 加载该节点的附件
    await this.fileHandler.setNodeUid(uid);

    const isFirstShow = this.el.style.display === 'none';
    this.el.style.display = 'flex';
    if (isFirstShow && !this.el.style.left) {
      const rect = this.el.getBoundingClientRect();
      // 首次显示：窗口居中
      this.el.style.left = Math.max(0, (window.innerWidth - rect.width) / 2) + 'px';
      this.el.style.top = Math.max(0, (window.innerHeight - rect.height) / 2) + 'px';
      this.el.style.right = 'auto';
    }

    this._attachNodeInputListener();
    this.freeBox.focus();
  }

  hide() {
    this._detachNodeInputListener();
    this.el.style.display = 'none';
    this.currentUid = null;
    this.chatSync.detach();
  }

  _renderMessages() {
    const messages = this.chatSync.getMessages();
    this.messagesEl.innerHTML = '';
    for (const msg of messages) {
      const bubble = document.createElement('div');
      bubble.className = `ai-msg ai-msg-${msg.role}`;
      bubble.textContent = msg.text;
      // user/ai 气泡渲染 LaTeX 公式（解析失败片段保持原文本）；系统/思维链气泡保持纯文本
      if (msg.role === 'user' || msg.role === 'ai') {
        renderMath(bubble);
      }
      this.messagesEl.appendChild(bubble);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  appendAIMessage(text) {
    this.chatSync.appendAIMessage(text);
    this._renderMessages();
  }

  _attachNodeInputListener() {
    if (!this.currentUid) return;
    const contentEl = this.nodeManager.nodeLayer.querySelector(
      `[data-uid="${this.currentUid}"] .node-content`
    );
    if (!contentEl) return;
    this._nodeInputListener = () => {
      if (this.chatSync.node) {
        this.chatSync.node.content = contentEl.textContent;
        this._renderMessages();
      }
    };
    contentEl.addEventListener('input', this._nodeInputListener);
    this._nodeContentEl = contentEl;
  }

  _detachNodeInputListener() {
    if (this._nodeInputListener && this._nodeContentEl) {
      this._nodeContentEl.removeEventListener('input', this._nodeInputListener);
    }
    this._nodeInputListener = null;
    this._nodeContentEl = null;
  }

  _bindDrag() {
    const header = this.el.querySelector('.ai-dialog-header');
    let startX = 0, startY = 0, originX = 0, originY = 0;
    header.addEventListener('mousedown', (e) => {
      if (e.target === this.closeBtn) return;
      this._dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      originX = rect.left;
      originY = rect.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this._dragging) return;
      this.el.style.left = (originX + e.clientX - startX) + 'px';
      this.el.style.top = (originY + e.clientY - startY) + 'px';
      this.el.style.right = 'auto';
      this.el.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      this._dragging = false;
      document.body.style.userSelect = '';
    });
  }

  _bindResize() {
    let startX = 0, startY = 0, startW = 0, startH = 0;
    this.resizerEl.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this._resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this._resizing) return;
      this.el.style.width = Math.max(280, startW + e.clientX - startX) + 'px';
      this.el.style.height = Math.max(200, startH + e.clientY - startY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      this._resizing = false;
      document.body.style.userSelect = '';
    });
  }

  _bindToggleKey() {
    document.addEventListener('keydown', (e) => {
      if (this.el.style.display === 'none') return;
      if (e.key !== 't' && e.key !== 'T') return;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const isTyping = (tag === 'textarea' || tag === 'input' || tag === 'div')
        && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
      if (isTyping) return;
      e.preventDefault();
      this.proxySwitch.toggle();
    });
  }

  _handleSend(text) {
    this.chatSync.appendUserMessage(text);
    this._renderMessages();

    // 按当前节点取附件（节点级持久化的，每次对话自动带上）
    const attachments = this.fileHandler.getAttachments();

    // AI 开关灭：只记录消息，不调 AI
    if (!this.proxySwitch.isAIEnabled) {
      return;
    }

    const path = this.nodeManager.getNodePath(this.currentUid);
    let delay = 0;
    for (const node of path) {
      const preview = (node.content || '').replace(/\n/g, ' ').slice(0, 15);
      const ellipsis = node.content && node.content.length > 15 ? '...' : '';
      const label = `检测到节点 ${node.uid.slice(0, 8)}：${preview}${ellipsis}`;
      setTimeout(() => this._appendSystemMessage(label), delay);
      delay += 120;
    }

    // 如果有附件，也显示一下
    if (attachments.length > 0) {
      const attNames = attachments.map(a => a.name).join('、');
      setTimeout(() => this._appendSystemMessage(`已自动带上 ${attachments.length} 个附件：${attNames}`), delay);
      delay += 120;
    }

    setTimeout(() => {
      if (this.onSend) {
        const contextText = this.nodeManager.getNodePathText(this.currentUid);
        Promise.resolve(this.onSend(text, contextText, attachments))
          .then(reply => {
            if (!reply) return;
            // 拆分思维链：后端格式 '[思考] reasoning\n══════\n{MODEL}：content'
            // reasoning 渲染成临时灰气泡（不进 chatSync/节点存储），content 照常持久化
            const SEP = '\n══════\n';
            const idx = reply.indexOf(SEP);
            if (idx >= 0) {
              let reasoning = reply.slice(0, idx);
              const content = reply.slice(idx + SEP.length);
              if (reasoning.startsWith('[思考] ')) reasoning = reasoning.slice(5);
              this._appendReasoningMessage(reasoning);
              this.appendAIMessage(content);
            } else {
              this.appendAIMessage(reply);
            }
          })
          .catch(err => {
            this._appendSystemMessage('[AI 出错] ' + err.message);
          });
      } else {
        this._appendSystemMessage('未设置 api');
      }
    }, delay);
  }

  _appendSystemMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg ai-msg-system';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  // 思维链气泡：临时灰字，不进 chatSync/节点 content（重启或切节点后消失）
  _appendReasoningMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg ai-msg-reasoning';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  _bindClose() {
    this.closeBtn.addEventListener('click', () => this.hide());
  }
}
