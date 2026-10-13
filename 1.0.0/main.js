// 应用入口：组装各模块（节点、存储、菜单栏、设置）
import { NodeManager } from './Node/node_manager.js';
import { LocalStorage } from './Node/local_storage.js';
import { JsonStorage } from './Node/json_storage.js';
import { SidebarManager } from './Menu/sidebar_manager.js';
import { initExportFolderSetting } from './Menu/Setting/Specify_export_folder.js';
import { ToolbarManager } from './Toolbar/toolbar_manager.js';
import { MoveTool } from './Toolbar/move_tool.js';
import { EdgeRenderer } from './Node/render_node_visualization/edge_renderer.js';
import { AIDialogManager } from './Node/AI/ai_dialog_manager.js';
import { sendToAI } from './Node/AI/ai_client.js';
import { clearAllNode } from './Node/clear_all_node.js';
import { FileFacade } from './Node/AI/file_handler/file_facade.js';
import { BackgroundSetting } from './Menu/Setting/background_setting.js';
import { oneClickClose } from './Menu/One_click_to_close.js';

// ========== 连线渲染器 ==========
const edgeRenderer = new EdgeRenderer(window.view);
window._edgeRenderer = edgeRenderer;

// ========== 节点管理 ==========
const nodeManager = new NodeManager(window.view);
window._nodeManager = nodeManager;
edgeRenderer.setNodeManager(nodeManager);

// 创建派生节点时画连线
nodeManager.onDerivedNodeCreated = (parentUid, childUid) => {
  edgeRenderer.addEdge(parentUid, childUid);
};

// 删除节点时清理相关连线 + 级联清理 IndexedDB 附件
nodeManager.onNodeDeleted = (uid) => {
  edgeRenderer.removeEdgesByNode(uid);
  FileFacade.deleteByNodeUid(uid);
};

// 清空所有节点时批量清理连线 + 批量清理附件
nodeManager.onAllNodesCleared = () => {
  edgeRenderer.restoreEdges([]);
  for (const uid of nodeManager._lastAllUids || []) {
    FileFacade.deleteByNodeUid(uid);
  }
};

// 当前加载的 json 文件 handle（从导入文件夹点 json 时注入，null = 未从 json 加载）
let currentJsonHandle = null;
let jsonSaveTimer = null;

nodeManager.onNodeChange = () => {
  LocalStorage.save(nodeManager.nodes);
  // 防抖回写 json 文件（500ms 内连续改动只写一次）
  if (currentJsonHandle) {
    clearTimeout(jsonSaveTimer);
    jsonSaveTimer = setTimeout(() => {
      JsonStorage.saveToFileHandle(nodeManager.nodes, currentJsonHandle)
        .catch(e => console.warn('[实时保存] 回写 json 失败:', e.message));
    }, 500);
  }
};

// ========== AI 对话框 ==========
const aiDialog = new AIDialogManager(nodeManager);
// 点击节点 → 弹出该节点的对话框（一次只开一个，点别的节点自动切换）
nodeManager.onNodeSelected = (uid) => {
  if (uid) aiDialog.showForNode(uid);
  else aiDialog.hide();
};
// 接入 AI：把本地代理请求挂到对话框的 onSend 上（透传附件）
aiDialog.onSend = async (userText, contextText, attachments) => sendToAI(userText, contextText, attachments);

const saved = LocalStorage.load();
if (saved.length > 0) {
  nodeManager.restoreNodes(saved);
  // 恢复连线
  const edges = [];
  for (const node of saved) {
    if (node.parentUid) {
      edges.push({ uid: `${node.parentUid}->${node.uid}`, from: node.parentUid, to: node.uid });
    }
  }
  edgeRenderer.restoreEdges(edges);
}

// ========== 菜单栏 ==========
const sidebar = new SidebarManager();

sidebar.addButton('导入 JSON', async () => {
  try {
    const data = await JsonStorage.import();
    nodeManager.restoreNodes(data);
    // 恢复连线
    const edges = [];
    for (const node of data) {
      if (node.parentUid) {
        edges.push({ uid: `${node.parentUid}->${node.uid}`, from: node.parentUid, to: node.uid });
      }
    }
    edgeRenderer.restoreEdges(edges);
    LocalStorage.save(nodeManager.nodes);
  } catch (e) {
    if (e.name !== 'AbortError') alert('导入失败: ' + e.message);
  }
});

// 导入文件夹：选文件夹 → 列 JSON → 点击切换存档（直接清空替换）
sidebar.addImportFolder({
  onSelect: async (data, fileName, fileHandle) => {
    // 切换前先把当前改动立即 flush 到旧 json（防抖可能还没执行，避免被 clearAll 取消）
    if (currentJsonHandle) {
      clearTimeout(jsonSaveTimer);
      jsonSaveTimer = null;
      try {
        await JsonStorage.saveToFileHandle(nodeManager.nodes, currentJsonHandle);
      } catch (e) {
        console.warn('[实时保存] 切换前 flush 失败:', e.message);
      }
    }
    // 临时禁用回写，避免 clearAll 触发的 onNodeChange 误写到旧 handle
    currentJsonHandle = null;
    // 清空当前画布（含连线 + 附件级联清理）
    nodeManager.clearAll();
    // 恢复节点 + 重建连线
    nodeManager.restoreNodes(data);
    const edges = [];
    for (const node of data) {
      if (node.parentUid) {
        edges.push({ uid: `${node.parentUid}->${node.uid}`, from: node.parentUid, to: node.uid });
      }
    }
    edgeRenderer.restoreEdges(edges);
    LocalStorage.save(nodeManager.nodes);
    // 恢复回写目标为新 json
    currentJsonHandle = fileHandle || null;
  }
});

// 创建画布（覆盖 + 清 json 回写绑定，只有手动导出才能永久保存）
sidebar.addCreateCanvas({
  // 清画布 + 连线 + LocalStorage
  clearCanvasFn() {
    nodeManager.clearAll();
    LocalStorage.save(nodeManager.nodes);
  },
  // 清 json 回写绑定 + 取消待写防抖（**阻断实时保存**：与一键清除的区别）
  resetJsonBindingFn() {
    clearTimeout(jsonSaveTimer);
    jsonSaveTimer = null;
    currentJsonHandle = null;
  }
});

sidebar.addButton('导出 JSON', async () => {
  try {
    await JsonStorage.export(nodeManager.nodes, exportFolder.getExportDir());
  } catch (e) {
    alert('导出失败: ' + e.message);
  }
});

sidebar.addButton('🧹 清空所有节点', () => clearAllNode(nodeManager));

// 设置（底部按钮）→ 点击齿轮从左侧滑出设置抽屉（含导出文件夹选择）
const settingsBtn = sidebar.addFooterButton('⚙ 设置');
const exportFolder = initExportFolderSetting(settingsBtn, JsonStorage);

// ========== 背景图设置 ==========
const bgSetting = new BackgroundSetting();
bgSetting.onChange = (background) => {
  // 通知 infinite_canvas.html 的渲染层更新背景
  if (window.setBackground) window.setBackground(background);
};
sidebar.addFooterButton('🎨 背景图', () => bgSetting.openPanel());
sidebar.addFooterButton('🛑 一键关闭', () => oneClickClose());

// ========== 底部工具栏 ==========
const toolbar = new ToolbarManager();

// 移动工具
const moveTool = new MoveTool(nodeManager, window.view);
const moveIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>';
toolbar.addTool(moveIcon, 'move');

toolbar.onToolChange((tool) => {
  moveTool.setActive(tool === 'move');
});
