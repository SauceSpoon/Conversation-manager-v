// 文件附件 UI 管理：📎按钮、附件 chip、base64 转换、节点级持久化
// 职责：
//   1. 创建 📎 按钮 + 隐藏 file input
//   2. 处理文件选择 → 转 base64 → 存 IndexedDB（带 nodeUid）
//   3. 显示/删除附件 chip
//   4. 绑定 nodeUid：切换节点时从 IndexedDB 加载该节点的所有附件
// 边界：
//   - 不做任何预处理（不抽 PDF/DOCX 文字、不识别图片内容）—— 预处理统一放后端
//   - 不处理发送逻辑（由 facade 统一调度），不处理节点 content 写入
//   - chip 状态灯只有"已上传"（绿色），不再区分文本抽取成功/失败

import { saveAttachment, deleteAttachment, getAttachmentsByNode } from '../../file_storage.js';

export class FileAttach {
  constructor() {
    this.nodeUid = null;      // 当前绑定的节点 uid（null = 未绑定）
    this._attachments = [];   // [{ uid, nodeUid, name, type, blob, base64, uploaded }]
    this._onChange = null;
    this._buildDOM();
  }

  _buildDOM() {
    this.mountEl = document.createElement('div');
    this.mountEl.className = 'ai-dialog-attach-area';
    this.mountEl.innerHTML = `
      <div class="ai-attach-chips"></div>
      <div class="ai-attach-btn" title="添加附件">📎</div>
      <input type="file" class="ai-attach-input" multiple accept=".pdf,.png,.jpg,.jpeg,.gif,.bmp,.doc,.docx,.txt,.md" hidden>
    `;
    this.chipsEl = this.mountEl.querySelector('.ai-attach-chips');
    this.btnEl = this.mountEl.querySelector('.ai-attach-btn');
    this.inputEl = this.mountEl.querySelector('.ai-attach-input');

    this.btnEl.addEventListener('click', () => this.inputEl.click());
    this.inputEl.addEventListener('change', (e) => this._onFileSelect(e));
  }

  getElement() { return this.mountEl; }

  setOnChange(cb) { this._onChange = cb; }

  // 绑定到某节点：从 IndexedDB 加载该节点的附件
  async setNodeUid(uid) {
    this.nodeUid = uid;
    if (uid) {
      await this._loadForNode(uid);
    } else {
      this._attachments = [];
      this._renderChips();
    }
    this._onChange?.();
  }

  async _loadForNode(nodeUid) {
    try {
      const stored = await getAttachmentsByNode(nodeUid);
      this._attachments = stored.map(s => ({
        uid: s.uid,
        nodeUid: s.nodeUid,
        name: s.name,
        type: s.type,
        blob: s.blob,
        base64: s.base64 || '',
        uploaded: true,  // 能从 IndexedDB 读出来 = 已上传
      }));
      this._renderChips();
    } catch (err) {
      console.error('[FileAttach] 加载附件失败:', err);
      this._attachments = [];
      this._renderChips();
    }
  }

  async _onFileSelect(e) {
    if (!this.nodeUid) {
      // 未绑定节点时允许选，但会拒绝保存（避免孤儿附件）
      alert('请先点击节点打开对话框，再添加附件');
      this.inputEl.value = '';
      return;
    }
    const files = Array.from(e.target.files);
    for (const file of files) {
      const uid = crypto.randomUUID();
      const base64 = await this._fileToBase64(file);
      const att = {
        uid,
        nodeUid: this.nodeUid,
        name: file.name,
        type: file.type,
        blob: file,
        base64,
      };
      // 持久化到 IndexedDB（含 nodeUid 绑定）
      await saveAttachment(att);
      this._attachments.push({ ...att, uploaded: true });
      this._renderChips();
    }
    this.inputEl.value = '';
    this._onChange?.();
  }

  _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  _renderChips() {
    this.chipsEl.innerHTML = '';
    for (const att of this._attachments) {
      // 状态灯：只有 1 种（已上传）—— 不再区分 PDF 抽取成功/失败
      const dotClass = att.uploaded ? 'ok' : 'none';
      const chip = document.createElement('span');
      chip.className = 'ai-attach-chip';
      chip.title = att.name;
      chip.innerHTML = `
        <span class="ai-attach-chip-dot ai-attach-chip-dot--${dotClass}"></span>
        <span class="ai-attach-chip-name">${att.name}</span>
        <span class="ai-attach-chip-remove">×</span>
      `;
      chip.querySelector('.ai-attach-chip-remove').addEventListener('click', async () => {
        await deleteAttachment(att.uid);
        this._attachments = this._attachments.filter(a => a.uid !== att.uid);
        this._renderChips();
        this._onChange?.();
      });
      this.chipsEl.appendChild(chip);
    }
  }

  // 供 AI 发送用：只返回 {uid, name, type, base64}（纯原始数据，预处理后端统一做）
  getAttachments() {
    return this._attachments.map(a => ({
      uid: a.uid,
      name: a.name,
      type: a.type,
      base64: a.base64,
    }));
  }

  // 清空当前节点的所有附件（从 IndexedDB 删 + 内存清）
  async clear() {
    for (const att of this._attachments) {
      await deleteAttachment(att.uid);
    }
    this._attachments = [];
    this._renderChips();
    this._onChange?.();
  }
}
