// 应用入口（w9）：在 w6 基础上增加侧边栏本地 JSON 存档
// 新增：导入 JSON / 导入文件夹 / 创建画布 / 导出 JSON（均来自 1.1.0）
// 精简：无 localStorage 自动保存、无工具栏、无背景图、无一键关闭
import { NodeManager } from './Node/node_manager.js';
import { EdgeRenderer } from './Node/render_node_visualization/edge_renderer.js';
import { AIDialogManager } from './Node/AI/ai_dialog_manager.js';
import { sendToAI } from './Node/AI/ai_client.js';
import { SidebarManager } from './Menu/sidebar_manager.js';
import { JsonStorage } from './Node/json_storage.js';

// 从存档数据推导连线（parentUid → 父子关系）
function buildEdges(data) {
  const edges = [];
  for (const node of data) {
    if (node.parentUid) {
      edges.push({ uid: `${node.parentUid}->${node.uid}`, from: node.parentUid, to: node.uid });
    }
  }
  return edges;
}

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

// 删除节点时清理相关连线
nodeManager.onNodeDeleted = (uid) => {
  edgeRenderer.removeEdgesByNode(uid);
};

// 清空所有节点时批量清理连线
nodeManager.onAllNodesCleared = () => {
  edgeRenderer.restoreEdges([]);
};

// ========== 本地 JSON 存档 ==========
// 当前打开的 json 文件 handle（从"导入文件夹"点 json 时注入，null = 未绑定）
let currentJsonHandle = null;
let jsonSaveTimer = null;

nodeManager.onNodeChange = () => {
  // 防抖回写 json 文件（500ms 内连续改动只写一次）
  if (!currentJsonHandle) return;
  clearTimeout(jsonSaveTimer);
  jsonSaveTimer = setTimeout(() => {
    JsonStorage.saveToFileHandle(nodeManager.nodes, currentJsonHandle)
      .catch(e => console.warn('[实时保存] 回写 json 失败:', e.message));
  }, 500);
};

// ========== AI 对话框 ==========
const aiDialog = new AIDialogManager(nodeManager);
// 点击节点 → 弹出该节点的对话框（一次只开一个，点别的节点自动切换）
nodeManager.onNodeSelected = (uid) => {
  if (uid) aiDialog.showForNode(uid);
  else aiDialog.hide();
};
// 接入 AI：把本地代理请求挂到对话框的 onSend 上
aiDialog.onSend = async (userText, contextText) => sendToAI(userText, contextText);

// ========== 侧边栏（只保留本地 JSON 存档相关按钮） ==========
const sidebar = new SidebarManager();

sidebar.addButton('导入 JSON', async () => {
  try {
    const data = await JsonStorage.import();
    nodeManager.restoreNodes(data);
    edgeRenderer.restoreEdges(buildEdges(data));
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
    nodeManager.clearAll();
    nodeManager.restoreNodes(data);
    edgeRenderer.restoreEdges(buildEdges(data));
    // 恢复回写目标为新 json
    currentJsonHandle = fileHandle || null;
  }
});

// 创建画布（覆盖 + 清 json 回写绑定，只有手动导出才能永久保存）
sidebar.addCreateCanvas({
  // 清画布 + 连线
  clearCanvasFn() {
    nodeManager.clearAll();
  },
  // 清 json 回写绑定 + 取消待写防抖
  resetJsonBindingFn() {
    clearTimeout(jsonSaveTimer);
    jsonSaveTimer = null;
    currentJsonHandle = null;
  }
});

sidebar.addButton('导出 JSON', async () => {
  try {
    // 未接入导出文件夹设置：直接走浏览器下载 canvas_nodes.json
    await JsonStorage.export(nodeManager.nodes);
  } catch (e) {
    alert('导出失败: ' + e.message);
  }
});
