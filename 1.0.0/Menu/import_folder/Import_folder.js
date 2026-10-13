// 导入文件夹面板（树形）：挂载文件夹 + lazy 扫描 JSON + 点击切换存档
// 职责：
//   1. 顶部 [+] 选根文件夹（可多个根，isSameEntry 严格去重）
//   2. 文件夹条目：[>]展开收起 / [+]创建空子文件夹 / [-]仅根移除显示 / [×]真删源 / [✎]改名
//   3. [>] 展开 = 显示子文件夹 + 扫描该文件夹内的 .json 文件
//   4. 点击 JSON = 读文件 → 解析 → 回调 onSelect(jsonData, fileName)
//   5. JSON 条目：[×]真删源 / [✎]改名
//   6. 双层高亮：当前 JSON 条目蓝色 + 其所属文件夹淡黄
//   7. 删/改名委托 Delete_current_folder_or_file.js / rename.js
// 边界：只读文件 + 回调数据 + 调子模块，不碰节点/连线/localStorage
// 用法：
//   import { initImportFolder } from './Menu/Import_folder.js';
//   const { rootEl } = initImportFolder({ onSelect: (data, fileName) => { ... } });

import { deleteFolderOrFile } from './Delete_current_folder_or_file.js';
import { renameEntry } from './rename.js';
import { saveArchive, loadArchive } from './Last_selected_archive.js';

let _uidCounter = 0;
function genUid() { return 'f' + (++_uidCounter); }

export function initImportFolder({ onSelect } = {}) {
  // ========== 状态 ==========
  const roots = [];                 // 根文件夹节点数组
  let currentJsonName = null;       // 当前加载的 JSON 文件名
  let currentJsonNodeUid = null;    // 当前 JSON 所属文件夹节点 uid
  let panelExpanded = false;        // 面板整体展开/收起

  // ========== DOM ==========
  const rootEl = document.createElement('div');
  rootEl.className = 'import-folder-panel';
  rootEl.innerHTML = `
    <div class="import-folder-header">
      <button class="import-folder-panel-toggle" title="展开/收起">›</button>
      <span class="import-folder-title">导入文件夹</span>
      <button class="import-folder-add-root" title="添加根文件夹">+</button>
    </div>
    <div class="import-folder-tree"></div>
  `;
  const panelToggleBtn = rootEl.querySelector('.import-folder-panel-toggle');
  const addRootBtn = rootEl.querySelector('.import-folder-add-root');
  const treeEl = rootEl.querySelector('.import-folder-tree');

  // 面板整体展开/收起
  panelToggleBtn.addEventListener('click', () => {
    panelExpanded = !panelExpanded;
    _updatePanelToggle();
    treeEl.style.display = panelExpanded ? 'block' : 'none';
  });

  function _updatePanelToggle() {
    panelToggleBtn.textContent = panelExpanded ? '⌄' : '›';
    panelToggleBtn.classList.toggle('expanded', panelExpanded);
  }

  // 初始收起
  treeEl.style.display = 'none';

  addRootBtn.addEventListener('click', () => _pickRootFolder());

  // ========== 选文件夹（仅根：parentNode=null） ==========
  async function _pickRootFolder() {
    if (!window.showDirectoryPicker) {
      alert('当前浏览器不支持选择文件夹（需 Chrome/Edge 86+）');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      // 严格去重：同层不允许相同 handle（isSameEntry 失败则退回 name 比对）
      if (await _isDuplicate(handle, roots)) {
        alert('该文件夹已添加，不允许重复');
        return;
      }
      const node = _createNode(handle.name, handle, null);
      roots.push(node);
      // 加根文件夹时自动展开面板（首次添加）
      if (!panelExpanded) {
        panelExpanded = true;
        _updatePanelToggle();
        treeEl.style.display = 'block';
      }
      _renderTree();
      saveArchive(roots);
    } catch (e) {
      if (e.name !== 'AbortError') alert('选择文件夹失败: ' + e.message);
    }
  }

  // ========== 创建空子文件夹（在 parentNode 下新建） ==========
  async function _createSubfolder(parentNode) {
    const name = prompt('新建子文件夹名称：', '新建文件夹');
    if (name === null) return;                  // 取消
    if (!name.trim()) { alert('名称不能为空'); return; }
    const trimmed = name.trim();
    try {
      // 同层重名检测
      if (await _existsByName(parentNode.handle, trimmed, true)) {
        alert(`已存在同名文件夹"${trimmed}"`);
        return;
      }
      const childHandle = await parentNode.handle.getDirectoryHandle(trimmed, { create: true });
      parentNode.expanded = true;  // 自动展开父
      // 重新扫描父（创建的子文件夹会被扫进 children，和系统目录保持一致）
      await _scanFolder(parentNode);
      _renderTree();
      saveArchive(roots);
    } catch (e) {
      alert('创建子文件夹失败: ' + (e.message || e));
    }
  }

  // 按名称检测同层是否存在（isDir=true 检测文件夹，false 检测文件）
  async function _existsByName(parentHandle, name, isDir) {
    try {
      if (isDir) await parentHandle.getDirectoryHandle(name);
      else await parentHandle.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async function _isDuplicate(handle, siblings) {
    for (const s of siblings) {
      try {
        if (await s.handle.isSameEntry(handle)) return true;
      } catch {
        if (s.name === handle.name) return true;
      }
    }
    return false;
  }

  function _createNode(name, handle, parent) {
    return {
      uid: genUid(),
      name, handle, parent,
      children: [],        // 手动挂载的子文件夹
      expanded: false,
      scanned: false,      // 是否已扫描 json
      jsonFiles: [],       // [{ name, handle }]
    };
  }

  // 扫描文件夹：同时收集【子文件夹】和【json 文件】
  // 效果：从系统（文件管理器）直接建的文件夹/json 也会显示出来
  // 关键：用磁盘目录作为 children 的真相来源，不再依赖"手动 push children"
  async function _scanFolder(node) {
    const subfolders = [];
    const jsonFiles = [];
    for await (const entry of node.handle.values()) {
      if (entry.kind === 'directory') {
        subfolders.push({ name: entry.name, handle: entry });
      } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.json')) {
        jsonFiles.push({ name: entry.name, handle: entry });
      }
    }
    subfolders.sort((a, b) => a.name.localeCompare(b.name));
    jsonFiles.sort((a, b) => a.name.localeCompare(b.name));

    // 重建 children（保留原节点的 expanded/scanned 态，避免子文件夹展开态被扫丢）
    const oldChildrenMap = new Map((node.children || []).map(c => [c.name, c]));
    node.children = [];
    for (const sf of subfolders) {
      const prev = oldChildrenMap.get(sf.name);
      if (prev) {
        // 子文件夹名没变，复用旧节点（保留 expanded、scanned、jsonFiles 缓存）
        node.children.push(prev);
      } else {
        node.children.push(_createNode(sf.name, sf.handle, node));
      }
    }
    node.jsonFiles = jsonFiles;
    node.scanned = true;
  }

  // ========== 从存档恢复（启动/刷新时自动调） ==========
  async function _restoreFromArchive() {
    const data = await loadArchive();
    if (!data.length) return;
    for (const entry of data) {
      if (!entry.handle) continue;
      // 权限校验：handle 跨会话保留，但需确认仍可用
      try {
        const perm = await entry.handle.queryPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          // 之前授权过的话浏览器会直接 granted；被清过权限则跳过该根
          continue;
        }
      } catch {
        continue;
      }
      const node = _createNode(entry.name, entry.handle, null);
      roots.push(node);
    }
    if (roots.length) {
      panelExpanded = true;
      _updatePanelToggle();
      treeEl.style.display = 'block';
      _renderTree();
      saveArchive(roots);  // 保存实际恢复的（被清权限的可能少了）
    }
  }

  // ========== 渲染整棵树 ==========
  function _renderTree() {
    treeEl.innerHTML = '';
    for (const root of roots) {
      treeEl.appendChild(_renderNode(root, true));
    }
  }

  // 渲染单个文件夹节点（递归）
  function _renderNode(node, isRoot) {
    const el = document.createElement('div');
    el.className = 'import-folder-node';
    el.dataset.uid = node.uid;

    // 行：[>] [📁名] [+] [×仅根]
    const row = document.createElement('div');
    row.className = 'import-folder-row';
    if (node.uid === currentJsonNodeUid) row.classList.add('active-folder');

    // [>] 展开/收起
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'import-folder-toggle';
    toggleBtn.textContent = node.expanded ? '⌄' : '›';
    toggleBtn.title = '展开/收起';
    toggleBtn.addEventListener('click', async () => {
      node.expanded = !node.expanded;
      if (node.expanded && !node.scanned) await _scanFolder(node);
      _renderTree();
    });
    row.appendChild(toggleBtn);

    // 文件夹名
    const nameEl = document.createElement('span');
    nameEl.className = 'import-folder-name';
    nameEl.textContent = '📁 ' + node.name;
    row.appendChild(nameEl);

    // [+] 创建空子文件夹
    const addBtn = document.createElement('button');
    addBtn.className = 'import-folder-add-child';
    addBtn.textContent = '+';
    addBtn.title = '在此文件夹下新建子文件夹';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _createSubfolder(node);
    });
    row.appendChild(addBtn);

    // [✎] 改名（委托 rename.js，需父 handle）
    const renameBtn = document.createElement('button');
    renameBtn.className = 'import-folder-rename';
    renameBtn.textContent = '✎';
    renameBtn.title = '重命名';
    renameBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const parentHandle = node.parent ? node.parent.handle : null;
      // 根文件夹无父 handle（用户选的顶级目录），无法改名
      if (!parentHandle) {
        alert('根文件夹无法改名（它由系统文件管理器管理）');
        return;
      }
      const newHandle = await renameEntry(parentHandle, node.handle, node.name);
      if (!newHandle) return;
      // 更新节点数据并重渲染
      node.handle = newHandle;
      node.name = newHandle.name;
      // 改名后 scanned 失效，重新扫描（子文件夹和 json 都重新对齐磁盘）
      await _scanFolder(node);
      _renderTree();
      saveArchive(roots);
    });
    row.appendChild(renameBtn);

    // [-] 仅根：从面板移除显示（不删源文件）
    if (isRoot) {
      const minusBtn = document.createElement('button');
      minusBtn.className = 'import-folder-minus';
      minusBtn.textContent = '−';
      minusBtn.title = '从面板移除（不删除源文件夹）';
      minusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = roots.indexOf(node);
        if (idx >= 0) roots.splice(idx, 1);
        _renderTree();
        saveArchive(roots);
      });
      row.appendChild(minusBtn);
    }

    // [×] 真删源文件夹（所有文件夹都有，弹确认委托删除模块）
    const delBtn = document.createElement('button');
    delBtn.className = 'import-folder-del';
    delBtn.textContent = '×';
    delBtn.title = '删除源文件夹（磁盘真删）';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await deleteFolderOrFile(node.handle, node.name);
      if (!ok) return;
      // 删除成功：从面板数据移除
      if (isRoot) {
        const idx = roots.indexOf(node);
        if (idx >= 0) roots.splice(idx, 1);
      } else if (node.parent) {
        const idx = node.parent.children.indexOf(node);
        if (idx >= 0) node.parent.children.splice(idx, 1);
      }
      // 若删的是当前 json 所属文件夹，清高亮
      if (node.uid === currentJsonNodeUid) {
        currentJsonName = null;
        currentJsonNodeUid = null;
      }
      _renderTree();
      saveArchive(roots);
    });
    row.appendChild(delBtn);

    el.appendChild(row);

    // 展开内容：子文件夹（递归）+ JSON 文件
    if (node.expanded) {
      const content = document.createElement('div');
      content.className = 'import-folder-content';

      // 子文件夹
      for (const child of node.children) {
        content.appendChild(_renderNode(child, false));
      }

      // JSON 文件
      if (node.scanned) {
        for (const jf of node.jsonFiles) {
          const item = document.createElement('div');
          item.className = 'import-folder-item';
          if (jf.name === currentJsonName && node.uid === currentJsonNodeUid) {
            item.classList.add('active');
          }
          item.title = jf.name;
          // 显示时去掉 .json 后缀（仅展示层，内部仍用完整文件名）
          item.textContent = '📄 ' + jf.name.replace(/\.json$/i, '');
          item.addEventListener('click', async () => {
            try {
              const file = await jf.handle.getFile();
              const text = await file.text();
              const data = JSON.parse(text);
              currentJsonName = jf.name;
              currentJsonNodeUid = node.uid;
              _renderTree();
              onSelect?.(data, jf.name, jf.handle);
            } catch (err) {
              alert('加载 JSON 失败: ' + err.message);
            }
          });

          // [×] 真删源 json 文件
          const jfDelBtn = document.createElement('button');
          jfDelBtn.className = 'import-folder-del import-folder-del-inline';
          jfDelBtn.textContent = '×';
          jfDelBtn.title = '删除源文件（磁盘真删）';
          jfDelBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await deleteFolderOrFile(jf.handle, jf.name);
            if (!ok) return;
            // 从 jsonFiles 移除
            const idx = node.jsonFiles.indexOf(jf);
            if (idx >= 0) node.jsonFiles.splice(idx, 1);
            // 若删的是当前 json，清高亮
            if (jf.name === currentJsonName && node.uid === currentJsonNodeUid) {
              currentJsonName = null;
              currentJsonNodeUid = null;
            }
            _renderTree();
          });
          item.appendChild(jfDelBtn);

          // [✎] 改名 json（委托 rename.js，父 handle = 所在文件夹）
          const jfRenameBtn = document.createElement('button');
          jfRenameBtn.className = 'import-folder-rename import-folder-del-inline';
          jfRenameBtn.textContent = '✎';
          jfRenameBtn.title = '重命名';
          jfRenameBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const newHandle = await renameEntry(node.handle, jf.handle, jf.name);
            if (!newHandle) return;
            // 若改的是当前 json，更新高亮名
            if (jf.name === currentJsonName && node.uid === currentJsonNodeUid) {
              currentJsonName = newHandle.name;
            }
            jf.handle = newHandle;
            jf.name = newHandle.name;
            _renderTree();
          });
          item.appendChild(jfRenameBtn);
          content.appendChild(item);
        }

        // 空提示
        if (node.children.length === 0 && node.jsonFiles.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'import-folder-empty';
          empty.textContent = '无子文件夹和 JSON';
          content.appendChild(empty);
        }
      }

      el.appendChild(content);
    }

    return el;
  }

  _renderTree();
  // 启动/刷新时自动从存档恢复上次显示的文件夹
  _restoreFromArchive();
  return {
    rootEl,
    // 清当前 JSON 高亮（创建画布时调：不再显示"当前加载"的标记）
    clearHighlight() {
      currentJsonName = null;
      currentJsonNodeUid = null;
      _renderTree();
    }
  };
}
