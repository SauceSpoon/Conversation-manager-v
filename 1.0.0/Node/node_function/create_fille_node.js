// 创建文件分支节点：右键菜单"文件分支" → 选文件 → 拷贝进 File_warehouse → 创建 content=[[uid/文件名]] 的子节点
// 职责：
//   1. 弹文件选择（只允许 .pdf/.doc/.png，与仓库白名单一致）
//   2. 先用 crypto.randomUUID() 生成节点 uid → POST /warehouse/import 上传（base64 只此一跳，落盘即弃）
//   3. 上传成功才创建节点（content = [[uid/文件名]]，唯一的记录）；失败 alert 且不留空节点（无需回滚）
// 边界：
//   - 不负责预览渲染（render_node_visualization/render_pdf_doc_png.js）
//   - 不负责 AI 读取（后端 file_reference_expander，未实现）
//   - 不碰 localStorage / json 存储（走 nodeManager.onNodeChange 现有链路）

export function createFileNode(nodeManager, parentUid) {
  return {
    name: '文件分支',
    icon: '📎',
    run: () => {
      const parent = nodeManager.nodes.get(parentUid);
      if (!parent) return;

      // 动态文件选择框（选完即弃）
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.png';
      input.addEventListener('change', (e) => _onFilePicked(e, nodeManager, parentUid));
      input.click();
    }
  };
}

async function _onFilePicked(e, nodeManager, parentUid) {
  const file = e.target.files?.[0];
  e.target.remove();
  if (!file) return;

  // ① 先生成 uid（节点还没建，仓库文件夹用它命名）
  const uid = crypto.randomUUID();
  const base64 = await _fileToBase64(file);

  // ② 入库：拷贝进 Node/File_warehouse/<uid>/<文件名>
  try {
    const resp = await fetch('/warehouse/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeUid: uid, name: file.name, base64 })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  } catch (err) {
    alert('文件入库失败：' + err.message + '\n（未创建节点，请确认 server.py 已重启）');
    return;
  }

  // ③ 入库成功才创建文件节点：content 整体就是路径标记（后端节点格式零改动）
  const parent = nodeManager.nodes.get(parentUid);
  if (!parent) return;
  const childX = parent.x + 260;
  const childY = parent.y + 120;
  const child = nodeManager.createNode(childX, childY, null, `[[${file.name}]]`);
  child.parentUid = parentUid;

  // ④ 通知连线（同 createDerivedNode 模式）
  if (nodeManager.onDerivedNodeCreated) {
    nodeManager.onDerivedNodeCreated(parentUid, child.uid);
  }
  nodeManager.onNodeChange?.();
}

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
