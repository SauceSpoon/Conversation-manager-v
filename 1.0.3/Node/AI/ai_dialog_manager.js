// AI 自由对话框管理器（w6 精简版）
// 职责：
//   1. 点击节点弹出浮动对话框，一次只开一个，点别的节点切换
//   2. 对话框可拖动、可缩放
//   3. 发送消息时通过 onSend 回调交给 ai_client
//   4. 节点文本框手动编辑时，对话框自动同步刷新（双向）
// 精简：无附件（IndexedDB）、无思考模式、无 AI 开关、无公式渲染
// 边界：不直接调 AI（靠 onSend 回调），不直接操作节点 content（通过 AIChatSync）
import { AIChatSync } from './ai_chat_sync.js';
import { FreeDialogBox } from './free_dialog_box.js';

export class AIDialogManager {
  constructor(nodeManager) {
    this.nodeManager = nodeManager;
    this.currentUid = null;
    this.chatSync = new AIChatSync(nodeManager);
    this.onSend = null;  // 注入：async (userText, contextText) => aiReplyText
    this._dragging = false;
    this._resizing = false;
    this._nodeInputListener = null;
    this.freeBox = new FreeDialogBox();
    this.freeBox.onSubmit = (text) => this._handleSend(text);
    this._buildDom();
    this._bindDrag();
    this._bindResize();
    this._bindClose();
  }

  _buildDom() {
    const el = document.createElement('div');
    el.className = 'ai-dialog';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="ai-dialog-header">
        <span class="ai-dialog-title">AI 对话</span>
        <button class="ai-dialog-close" title="关闭">×</button>
      </div>
      <div class="ai-dialog-messages"></div>
      <div class="ai-dialog-resizer" title="拖动调整大小"></div>
    `;
    document.body.appendChild(el);
    this.el = el;
    this.titleEl = el.querySelector('.ai-dialog-title');
    this.messagesEl = el.querySelector('.ai-dialog-messages');
    this.closeBtn = el.querySelector('.ai-dialog-close');
    this.resizerEl = el.querySelector('.ai-dialog-resizer');
    this.el.insertBefore(this.freeBox.getRootElement(), this.resizerEl);
    this.el.addEventListener('wheel', (e) => e.stopPropagation(), true);
  }

  // 为某节点弹出对话框（已开则切换内容）
  showForNode(uid) {
    this._detachNodeInputListener();

    this.currentUid = uid;
    this.chatSync.attach(uid);
    this.titleEl.textContent = `对话 ${uid.slice(0, 8)}`;
    this._renderMessages();
    this.freeBox.clear();

    const isFirstShow = this.el.style.display === 'none';
    this.el.style.display = 'flex';
    if (isFirstShow && !this.el.style.left) {
      const rect = this.el.getBoundingClientRect();
      // 首次显示：窗口居中
      this.el.style.left = Math.max(0, (window.innerWidth - rect.width) / 2) + 'px';
      this.el.style.top = Math.max(0, (window.innerHeight - rect.height) / 2) + 'px';
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

  _handleSend(text) {
    this.chatSync.appendUserMessage(text);
    this._renderMessages();

    if (!this.onSend) {
      this._appendSystemMessage('未设置 api');
      return;
    }

    // 分支对话核心：上下文 = 从根到当前节点的路径文本（各分支互不污染）
    const contextText = this.nodeManager.getNodePathText(this.currentUid);
    Promise.resolve(this.onSend(text, contextText))
      .then(reply => {
        if (!reply) return;
        this.appendAIMessage(reply);
      })
      .catch(err => {
        this._appendSystemMessage('[AI 出错] ' + err.message);
      });
  }

  _appendSystemMessage(text) {
    const bubble = document.createElement('div');
    bubble.className = 'ai-msg ai-msg-system';
    bubble.textContent = text;
    this.messagesEl.appendChild(bubble);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  _bindClose() {
    this.closeBtn.addEventListener('click', () => this.hide());
  }
}
