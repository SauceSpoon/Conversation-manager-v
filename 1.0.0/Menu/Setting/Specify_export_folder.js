// 设置抽屉：从左侧滑出的设置面板
// 职责：
//   1. 点击齿轮按钮 → 从左侧滑出设置抽屉（含遮罩层）
//   2. 抽屉内放置"导出文件夹"选择栏
//   3. 点击遮罩或关闭按钮 → 收回抽屉
// 边界：只管抽屉的显隐与导出文件夹选择，不涉及其他设置项（后续可往里加）
// 用法：
//   import { initExportFolderSetting } from './Menu/Setting/Specify_export_folder.js';
//   const { getExportDir } = initExportFolderSetting(settingsBtnEl, JsonStorage);

export function initExportFolderSetting(settingsBtnEl, JsonStorage) {
  let exportDir = null;
  let drawerEl = null;
  let backdropEl = null;
  let dirNameEl = null;
  let isOpen = false;

  function ensureDrawer() {
    if (drawerEl) return;

    // 遮罩层：点击关闭抽屉
    backdropEl = document.createElement('div');
    backdropEl.className = 'settings-backdrop';
    backdropEl.addEventListener('click', () => close());

    // 抽屉本体
    drawerEl = document.createElement('div');
    drawerEl.className = 'settings-drawer';
    drawerEl.innerHTML = `
      <div class="settings-drawer-header">
        <span>设置</span>
        <button class="settings-drawer-close" title="关闭">×</button>
      </div>
      <div class="settings-drawer-body">
        <div class="settings-drawer-icon-wrap">
          <img class="settings-drawer-icon" src="Menu/Setting/background/20260914185223_31_2.jpg" alt="设置图标">
          <div class="settings-drawer-icon-text">1.0.0</div>
        </div>
      </div>
      <div class="settings-drawer-footer">
        <label>导出文件夹</label>
        <div class="dir-row">
          <span class="dir-name">未选择（下载方式）</span>
          <button class="pick-btn">选择</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdropEl);
    document.body.appendChild(drawerEl);

    dirNameEl = drawerEl.querySelector('.dir-name');
    const pickBtn = drawerEl.querySelector('.pick-btn');
    const closeBtn = drawerEl.querySelector('.settings-drawer-close');

    pickBtn.addEventListener('click', async () => {
      try {
        exportDir = await JsonStorage.pickDirectory();
        dirNameEl.textContent = exportDir ? exportDir.name : '未选择（下载方式）';
      } catch (e) {
        if (e.name !== 'AbortError') alert('选择文件夹失败: ' + e.message);
      }
    });

    closeBtn.addEventListener('click', () => close());
  }

  function open() {
    ensureDrawer();
    isOpen = true;
    backdropEl.classList.add('show');
    drawerEl.classList.add('show');
  }

  function close() {
    isOpen = false;
    if (backdropEl) backdropEl.classList.remove('show');
    if (drawerEl) drawerEl.classList.remove('show');
  }

  // 齿轮按钮切换抽屉
  settingsBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen) close();
    else open();
  });

  return {
    getExportDir: () => exportDir,
    // 抽屉固定从左侧滑出，不再需要随侧边栏宽度调整位置
    refreshPosition: () => {}
  };
}
