// 文件节点渲染：content 整体为 [[uid/文件名]] 标记的节点 → 磁盘实时映射预览
// 职责：
//   1. isFileNodeContent(content)：判断是否文件节点（content 整体只是一个 [[...]] 标记）
//   2. renderFilePreview(container, content)：按扩展名分支渲染
//      - .png → <img>（滚轮缩放，0.2x ~ 8x）
//      - .pdf → <iframe>（浏览器自带 PDF 查看器，自带缩放/翻页）
//      - .doc → 占位卡片（浏览器无法原生预览 doc，提示转 pdf）
//   3. src 走相对 URL = server.py 静态服务 = 磁盘实时映射：
//      用户在资源管理器改了文件，重建节点/刷新页面即最新，无同步逻辑
// 边界：
//   - 只渲染，不改节点数据；AI 读取由后端 expander 负责（未实现）
//   - 由 node_manager._renderNode 调用；样式在 node_style.css

const WAREHOUSE_URL_BASE = '/Node/File_warehouse';

// 判断节点是否文件节点：content 去空格后整体匹配 [[...]]（唯一标记，无其他文本）
export function isFileNodeContent(content) {
  return /^\[\[.+\]\]$/.test((content || '').trim());
}

// 把 [[文件名]] 解析成 { name, ext, url }；非法标记返回 null
// 兼容旧格式 [[uid/文件名]]：取最后一段作为文件名（仓库已平铺）
function _parseMarker(content) {
  const inner = content.trim().slice(2, -2);
  const name = inner.split(/[\\/]/).pop();
  if (!name || name === '.' || name === '..') return null;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = name.slice(dot).toLowerCase();
  const url = `${WAREHOUSE_URL_BASE}/${encodeURIComponent(name)}`;
  return { name, ext, url };
}

// 渲染入口：container 是节点的 .node-content 元素
export function renderFilePreview(container, content) {
  const parsed = _parseMarker(content);
  container.classList.add('node-file-preview');
  container.innerHTML = '';

  if (!parsed) {
    _renderInvalid(container, content);
    return;
  }
  if (parsed.ext === '.png') _renderImage(container, parsed);
  else if (parsed.ext === '.pdf') _renderPdf(container, parsed);
  else if (parsed.ext === '.doc') _renderDocPlaceholder(container, parsed);
  else _renderUnsupported(container, parsed);
}

// png：<img> + 滚轮缩放
function _renderImage(container, { url, name }) {
  const img = document.createElement('img');
  img.className = 'node-file-image';
  img.src = url;
  img.title = name;
  img.alt = name;
  img.draggable = false;

  let scale = 1;
  // node_manager 已在 content 上注册 wheel capture（stopPropagation），
  // 同元素的其他 wheel 监听仍会触发（stopPropagation 不拦同元素监听器）
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    scale *= e.deltaY < 0 ? 1.1 : 1 / 1.1;
    scale = Math.max(0.2, Math.min(8, scale));
    img.style.transform = `scale(${scale})`;
  });
  container.appendChild(img);
}

// pdf：<iframe> 浏览器自带查看器
// 双模式：
//   默认（节点模式）：overlay 拦截事件 → 行为与普通节点一致（右键菜单/滚轮缩放/选中）
//   查看模式：overlay 隐藏 → iframe 接管事件（可翻页/缩放 pdf），节点功能被覆盖
// 切换：hover 时左上角"查看"按钮进入查看模式；查看模式左上角"退出"按钮恢复
//        快捷键 F：切当前选中 PDF 节点的查看/退出（全局监听，只注册一次）

let _pdfKeyBound = false;
function _ensurePdfKeybind() {
  if (_pdfKeyBound) return;
  _pdfKeyBound = true;
  document.addEventListener('keydown', (e) => {
    if ((e.key !== 'f' && e.key !== 'F') || e.ctrlKey || e.altKey || e.metaKey) return;
    // 正在输入框/编辑区打字时不拦截
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    if (document.activeElement?.isContentEditable) return;
    // 找当前选中的 PDF 节点
    const sel = document.querySelector('.canvas-node.selected .node-file-preview');
    if (!sel) return;
    e.preventDefault();
    sel.classList.toggle('viewing');
  });
}

function _renderPdf(container, { url, name }) {
  _ensurePdfKeybind();

  const iframe = document.createElement('iframe');
  iframe.className = 'node-file-pdf';
  iframe.src = url;
  iframe.title = name;

  // 透明遮罩：默认拦截 iframe 吞掉的事件，让右键/滚轮/点击冒泡到节点
  const overlay = document.createElement('div');
  overlay.className = 'node-file-overlay';
  overlay.title = name;

  // 左上角"查看"按钮（默认模式下 hover 显示）
  const viewBtn = document.createElement('button');
  viewBtn.className = 'node-file-view-btn';
  viewBtn.textContent = '查看';
  viewBtn.title = '进入 PDF 查看模式（可翻页/缩放）';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.add('viewing');
  });

  // 左上角"退出"按钮（查看模式下显示）
  const exitBtn = document.createElement('button');
  exitBtn.className = 'node-file-exit-btn';
  exitBtn.textContent = '退出';
  exitBtn.title = '退出查看，恢复节点编辑（快捷键 F）';
  exitBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.remove('viewing');
  });

  container.append(iframe, overlay, viewBtn, exitBtn);
}

// doc：占位卡片（浏览器原生不支持 doc 预览）
function _renderDocPlaceholder(container, { name }) {
  const div = document.createElement('div');
  div.className = 'node-file-doc-placeholder';
  const icon = document.createElement('div');
  icon.className = 'node-file-doc-icon';
  icon.textContent = '📄';
  const nameEl = document.createElement('div');
  nameEl.className = 'node-file-doc-name';
  nameEl.textContent = name;
  const tip = document.createElement('div');
  tip.className = 'node-file-doc-tip';
  tip.textContent = '浏览器不支持预览 doc，请转 pdf';
  div.append(icon, nameEl, tip);
  container.appendChild(div);
}

// 无效标记（uid/文件名不合法）
function _renderInvalid(container) {
  const div = document.createElement('div');
  div.className = 'node-file-doc-placeholder';
  div.textContent = '无效的文件标记';
  container.appendChild(div);
}

// 类型不支持（理论到不了：仓库白名单已限 pdf/doc/png，防御性保留）
function _renderUnsupported(container, { name }) {
  const div = document.createElement('div');
  div.className = 'node-file-doc-placeholder';
  div.textContent = `暂不支持预览：${name}`;
  container.appendChild(div);
}
