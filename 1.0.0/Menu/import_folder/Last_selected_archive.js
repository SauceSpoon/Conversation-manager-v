// 持久化记录"导入文件夹"面板当前显示了哪些根文件夹
// 职责：
//   1. saveArchive(roots) — 序列化根文件夹（只存 name + handle）存入 IndexedDB
//   2. loadArchive() — 读出存档：[{ name, handle }]
//   3. 只看根文件夹，子结构由展开时扫描磁盘实时得到（从系统文件管理器直接建的也能显示）
// 存储格式：[{ name, handle }]
// 边界：只存/读根，不存子结构（子结构由磁盘目录实时扫描对齐）
// 依赖：FileSystemHandle 需结构化克隆，必须用 IndexedDB（localStorage 不支持）

const DB_NAME = 'ui_import_folder_archive';
const STORE_NAME = 'roots';
const KEY = 'last_archive';

let db = null;

function openDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

// 保存当前面板的根文件夹列表
export async function saveArchive(roots) {
  try {
    const conn = await openDB();
    // 只存根：name + handle；子结构由磁盘实时扫描，不持久化
    const data = roots.map(r => ({ name: r.name, handle: r.handle }));
    await new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(data, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[Last_selected_archive] 保存失败:', e);
  }
}

// 读取存档：返回 [{ name, handle }]；无存档返回 []
export async function loadArchive() {
  try {
    const conn = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[Last_selected_archive] 读取失败:', e);
    return [];
  }
}
