// JSON 文件导入/导出（支持 File System Access API，不支持时回退到下载/文件选择）
// 存档字段唯一权威：加字段 = serializeNode 加一行（写侧自动带）+ normalizeNode 加一行（读侧自动兼容老存档）
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from './Node_uid_pointer.js';

// ========== 存档字段清单（唯一权威，勿在其他文件手抄字段） ==========
// 写侧：节点对象 → 存档格式（JsonStorage.export / saveToFileHandle / LocalStorage.save 共用）
// 注：值为 undefined 的字段 JSON.stringify 会自动省略，不写进存档
export function serializeNode(n) {
  return {
    uid: n.uid, x: n.x, y: n.y, content: n.content, title: n.title,
    width: n.width, height: n.height, parentUid: n.parentUid || null
  };
}

// 读侧：单节点补默认值（老存档缺字段 / 手改 JSON 漏字段时防报错）
export function normalizeNode(n) {
  return {
    ...n,
    title: typeof n.title === 'string' ? n.title : '',
    content: typeof n.content === 'string' ? n.content : '',
    width: Number.isFinite(n.width) ? n.width : DEFAULT_WIDTH,
    height: Number.isFinite(n.height) ? n.height : DEFAULT_HEIGHT,
    parentUid: n.parentUid ?? null
  };
}

// 读侧：整份存档归一化（三个读入口共用：JsonStorage.import / LocalStorage.load / Import_folder）
export function normalizeCanvasData(data) {
  return Array.isArray(data) ? data.map(normalizeNode) : [];
}

export const JsonStorage = {
  // 选择导出文件夹（需要 Chrome/Edge 86+）
  async pickDirectory() {
    if (!window.showDirectoryPicker) {
      alert('当前浏览器不支持选择文件夹，将使用下载方式导出');
      return null;
    }
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return handle;
  },

  // 导出节点数据到 JSON 文件
  async export(nodes, dirHandle) {
    const data = Array.from(nodes.values()).map(serializeNode);
    const json = JSON.stringify(data, null, 2);

    if (dirHandle) {
      // 写入指定文件夹
      const fileHandle = await dirHandle.getFileHandle('canvas_nodes.json', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(json);
      await writable.close();
    } else {
      // 回退：触发浏览器下载
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'canvas_nodes.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  // 从 JSON 文件导入节点数据
  async import() {
    if (window.showOpenFilePicker) {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      const file = await fileHandle.getFile();
      return normalizeCanvasData(JSON.parse(await file.text()));
    } else {
      // 回退：使用 <input type="file">
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async () => {
          const file = input.files[0];
          if (file) resolve(normalizeCanvasData(JSON.parse(await file.text())));
        };
        input.click();
      });
    }
  },

  // 回写到指定 fileHandle（覆盖原 json 文件，供实时保存用）
  async saveToFileHandle(nodes, fileHandle) {
    if (!fileHandle) return;
    const data = Array.from(nodes.values()).map(serializeNode);
    const json = JSON.stringify(data, null, 2);
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }
};
