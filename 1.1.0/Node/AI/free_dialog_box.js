// 自由文本框：AI 对话框的输入区（textarea + 发送按钮）
// 职责：
//   1. 管理输入框 DOM 和发送按钮
//   2. 处理 Enter 发送 / Shift+Enter 换行
//   3. 通过 onSubmit(text) 回调把用户输入交出去
// 边界：不做业务逻辑（不调 AI、不写节点 content），只管"输入 + 发送事件"
// 由 AIDialogManager 创建并挂载到对话框底部
// 用法：
//   import { FreeDialogBox } from './free_dialog_box.js';
//   const box = new FreeDialogBox();
//   box.onSubmit = (text) => { ... };
//   container.appendChild(box.getRootElement());

export class FreeDialogBox {
  constructor() {
    this.onSubmit = null;  // (text) => void，由 AIDialogManager 注入业务逻辑
    // 思考状态变化回调：(config) => void，由 AIDialogManager 注入（推送到后端 /thinking）
    this.onThinkingChange = null;
    // 思考模式状态（仅内存，当前不随请求发送；后端接入后由 AIDialogManager 读取）
    // 对应 OpenAI 格式：thinking={type: enabled/disabled}，reasoning_effort=low/high/max
    this.thinking = { enabled: false, effort: 'high' };
    this._buildDom();
    this._bindThinkingEvents();
    this._bindEvents();
  }

  _buildDom() {
    const root = document.createElement('div');
    root.className = 'ai-dialog-input-area';
    root.innerHTML = `
      <div class="ai-dialog-tools-row">
        <div class="ai-dialog-attach-mount"></div>
        <div class="ai-dialog-thinking-bar">
          <button class="ai-thinking-toggle" type="button" title="思考模式：开启后模型先输出思维链再回答">
            <span class="ai-thinking-icon">💡</span>
            <span class="ai-thinking-light"></span>
          </button>
          <div class="ai-thinking-efforts">
            <button class="ai-thinking-effort" data-effort="low" type="button" title="低强度思考">低</button>
            <button class="ai-thinking-effort" data-effort="high" type="button" title="高强度思考">高</button>
            <button class="ai-thinking-effort" data-effort="max" type="button" title="最大强度思考">Max</button>
          </div>
        </div>
      </div>
      <textarea class="ai-dialog-input" placeholder="输入消息，Enter 发送，Shift+Enter 换行" rows="2"></textarea>
      <button class="ai-dialog-send">发送</button>
    `;
    this.rootEl = root;
    this.inputEl = root.querySelector('.ai-dialog-input');
    this.sendBtn = root.querySelector('.ai-dialog-send');
    this.attachMount = root.querySelector('.ai-dialog-attach-mount');
    this.thinkingToggle = root.querySelector('.ai-thinking-toggle');
    this.thinkingLight = root.querySelector('.ai-thinking-light');
    this.effortBtns = root.querySelectorAll('.ai-thinking-effort');
    this._syncThinkingUI();
  }

  // 思考模式交互：点灯/熄灯切换；点亮后才能选强度（低/高/Max）
  _bindThinkingEvents() {
    this.thinkingToggle.addEventListener('click', () => {
      this.thinking.enabled = !this.thinking.enabled;
      this._syncThinkingUI();
    });
    this.effortBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.thinking.enabled) return;  // 关闭状态下强度不可选
        this.thinking.effort = btn.dataset.effort;
        this._syncThinkingUI();
      });
    });
  }

  // 按状态刷新灯和强度按钮样式；构造时回调尚未注入（null），不会误发请求
  _syncThinkingUI() {
    this.thinkingLight.dataset.state = this.thinking.enabled ? 'on' : 'off';
    this.thinkingToggle.classList.toggle('active', this.thinking.enabled);
    this.effortBtns.forEach(btn => {
      btn.classList.toggle('active', this.thinking.enabled && btn.dataset.effort === this.thinking.effort);
      btn.disabled = !this.thinking.enabled;
    });
    this.onThinkingChange?.(this.getThinkingConfig());
  }

  // 供将来 AIDialogManager 发送前读取：{ enabled: bool, effort: 'low'|'high'|'max' }
  getThinkingConfig() {
    return { ...this.thinking };
  }

  // 外部（后端状态回读）对齐灯：只更新 UI，不反向触发推送，避免回环
  applyThinkingConfig(config) {
    if (!config) return;
    this.thinking.enabled = !!config.enabled;
    if (['low', 'high', 'max'].includes(config.effort)) {
      this.thinking.effort = config.effort;
    }
    const cb = this.onThinkingChange;
    this.onThinkingChange = null;
    this._syncThinkingUI();
    this.onThinkingChange = cb;
  }

  _bindEvents() {
    const submit = () => {
      const text = this.inputEl.value.trim();
      if (!text) return;
      this.inputEl.value = '';
      // 只把文本交出去，业务逻辑由 AIDialogManager 在 onSubmit 里处理
      this.onSubmit?.(text);
    };
    this.sendBtn.addEventListener('click', submit);
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    });
  }

  // 供 AIDialogManager 把输入区挂到对话框 DOM 里
  getRootElement() {
    return this.rootEl;
  }

  getValue() {
    return this.inputEl.value;
  }

  setValue(text) {
    this.inputEl.value = text;
  }

  // 供 file_facade 挂载附件 UI
  getAttachMount() {
    return this.attachMount;
  }

  clear() {
    this.inputEl.value = '';
  }

  focus() {
    this.inputEl.focus();
  }
}
