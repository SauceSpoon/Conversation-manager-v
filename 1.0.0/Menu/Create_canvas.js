// 创建画布：覆盖当前画布（清空 + 清绑定的实时保存句柄）
// 职责：
//   1. 弹 confirm 确认未保存改动会丢（只有手动导出才能永久保存）
//   2. 确认后调注入的 callbacks：
//      - clearCanvasFn() 清节点 + 清连线 + 清 LocalStorage
//      - resetJsonBindingFn() 清 currentJsonHandle（**阻断实时保存回写**，不回写到原 json）
//      - resetImportFolderHighlightFn() 清导入文件夹面板的高亮（不再显示"当前存档"高亮）
//   3. 提供按钮：弹 confirm 后调上述 callbacks
// 边界：不直接操作 nodeManager/edgeRenderer/LocalStorage（都通过注入回调），不碰面板挂载
// 用法：
//   import { createCanvasButton } from './Menu/Create_canvas.js';
//   const btn = createCanvasButton({ clearCanvasFn, resetJsonBindingFn, resetImportFolderHighlightFn });
//   sidebar.itemsContainer.appendChild(btn);
// 与"一键清除"的区别：
//   - 一键清除：只清画布内容，currentJsonHandle 仍绑定（后续改动会继续回写原 json → 覆盖原存档数据，危险）
//   - 创建画布：清画布 + **清 currentJsonHandle 阻断回写**（后续改动只存 localStorage，不碰任何磁盘 json，需手动导出才永久保存）

export function createCanvasButton({ clearCanvasFn, resetJsonBindingFn, resetImportFolderHighlightFn } = {}) {
  const btn = document.createElement('button');
  btn.className = 'sidebar-btn';
  btn.textContent = '🆕 创建画布';

  btn.addEventListener('click', async () => {
    const ok = confirm(
      '确定创建新画布？\n\n' +
      '当前画布会被清空覆盖。\n' +
      '⚠ 新画布的改动不会自动写回任何磁盘 JSON，\n' +
      '  只有手动点【导出 JSON】才能永久保存。'
    );
    if (!ok) return;

    try {
      // 1. 清空画布 + LocalStorage + 连线（由 main.js 注入）
      if (clearCanvasFn) await clearCanvasFn();
      // 2. 清 currentJsonHandle → 阻断实时保存回写（关键：与"一键清除"的区别）
      if (resetJsonBindingFn) await resetJsonBindingFn();
      // 3. 清导入文件夹面板高亮（当前条、当前所属文件夹）
      if (resetImportFolderHighlightFn) await resetImportFolderHighlightFn();
    } catch (e) {
      console.warn('[创建画布] 清理失败:', e.message);
    }
  });

  return btn;
}
