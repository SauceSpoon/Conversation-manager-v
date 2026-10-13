// 设置抽屉：从左侧滑出的设置面板
// 职责：
//   1. 点击齿轮按钮 → 从左侧滑出设置抽屉（含遮罩层）
//   2. 抽屉内放置"更换背景"按钮（触发 BackgroundSetting.openPanel）
//   3. 暴露 pickDirectory() 供侧边栏"导出文件夹"按钮调用，exportDir 状态仍归本模块管理
//   4. 点击遮罩或关闭按钮 → 收回抽屉
// 边界：只管抽屉显隐 + 背景按钮触发 + 导出目录状态，不涉及其他设置项
// 用法：
//   import { initExportFolderSetting } from './Menu/Setting/Specify_export_folder.js';
//   const { getExportDir, pickDirectory } = initExportFolderSetting(settingsBtnEl, JsonStorage, bgSetting);

export function initExportFolderSetting(settingsBtnEl, JsonStorage, bgSetting) {
  let exportDir = null;
  let drawerEl = null;
  let backdropEl = null;
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
          <div class="settings-drawer-icon-text">1.1.0</div>
        </div>
      </div>
      <div class="settings-drawer-footer">
        <button class="bg-open-btn" title="打开背景图设置">🎨 更换背景</button>
      </div>
    `;
    document.body.appendChild(backdropEl);
    document.body.appendChild(drawerEl);

    const bgBtn = drawerEl.querySelector('.bg-open-btn');
    const closeBtn = drawerEl.querySelector('.settings-drawer-close');

    // 点"更换背景" → 打开 BackgroundSetting 浮窗（背景图模块独立，本处只触发）
    bgBtn.addEventListener('click', () => {
      close();  // 先收回抽屉，避免浮窗被抽屉遮挡
      bgSetting?.openPanel();
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

  // 供侧边栏"导出文件夹"按钮调用：选目录 → 更新 exportDir 状态
  async function pickDirectory() {
    try {
      exportDir = await JsonStorage.pickDirectory();
    } catch (e) {
      if (e.name !== 'AbortError') alert('选择文件夹失败: ' + e.message);
    }
  }

  return {
    getExportDir: () => exportDir,
    pickDirectory,
    refreshPosition: () => {}
  };
}
