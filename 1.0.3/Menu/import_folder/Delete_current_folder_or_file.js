// 真删源文件/文件夹：弹确认 → 调 FileSystemHandle.remove 删除磁盘上的源
// 职责：
//   1. 弹 confirm 二次确认（不可恢复操作）
//   2. 文件夹 → handle.remove({ recursive: true })；文件 → handle.remove()
//   3. 失败时 alert 错误信息
// 边界：只删源 + 返回结果，不碰面板数据结构（面板的移除由调用方负责）
// 依赖：handle 需 readwrite 权限（showDirectoryPicker mode:'readwrite' 选的）
// 用法：
//   import { deleteFolderOrFile } from '../Delete_current_folder_or_file.js';
//   const ok = await deleteFolderOrFile(handle, name);
//   if (ok) { /* 从面板数据移除并重渲染 */ }

export async function deleteFolderOrFile(handle, name) {
  if (!handle || typeof handle.remove !== 'function') {
    alert('该 handle 不支持删除（可能权限不足或浏览器版本过低）');
    return false;
  }
  const typeLabel = handle.kind === 'directory' ? '文件夹' : '文件';
  const ok = confirm(`确定删除${typeLabel}"${name}"？\n此操作将删除磁盘上的源${typeLabel}，不可恢复。`);
  if (!ok) return false;
  try {
    if (handle.kind === 'directory') {
      // 递归删除文件夹及其所有内容
      await handle.remove({ recursive: true });
    } else {
      await handle.remove();
    }
    return true;
  } catch (e) {
    alert(`删除${typeLabel}失败：${e.message || e}\n（可能权限不足，确保选文件夹时授权了写权限）`);
    return false;
  }
}
