// 改名：弹输入框 → 在父目录创建新名 handle + 复制内容 → 删旧 handle → 返回新 handle
// 职责：
//   1. 弹 prompt 输入新名（默认填当前名，用户可改）
//   2. 文件夹 → 父目录 getDirectoryHandle(newName, {create:true}) + 递归复制内容 + 删旧
//   3. 文件 → 父目录 getFileHandle(newName, {create:true}) + 写入旧文件内容 + 删旧
//   4. 同名检测、空名、取消 → 返回 null
// 边界：只管改名 + 返回新 handle，不碰面板数据结构（面板更新由调用方负责）
// 依赖：父 handle 必须传，新名同层不能已存在
// 用法：
//   import { renameEntry } from './rename.js';
//   const newHandle = await renameEntry(parentHandle, oldHandle, oldName);
//   if (newHandle) { /* 用 newHandle 更新面板 */ }

export async function renameEntry(parentHandle, oldHandle, oldName) {
  if (!parentHandle || !oldHandle) {
    alert('缺少父目录或目标 handle，无法改名');
    return null;
  }
  const isDir = oldHandle.kind === 'directory';
  const typeLabel = isDir ? '文件夹' : '文件';
  const newName = prompt(`重命名${typeLabel}"${oldName}" 为：`, oldName);
  // 取消 / 空 / 未改
  if (newName === null) return null;
  if (!newName.trim()) { alert('名称不能为空'); return null; }
  if (newName === oldName) return null;

  try {
    // 同层重名检测
    if (await _exists(parentHandle, newName, isDir)) {
      alert(`已存在同名${typeLabel}"${newName}"`);
      return null;
    }

    let newHandle;
    if (isDir) {
      newHandle = await parentHandle.getDirectoryHandle(newName, { create: true });
      await _copyDirRecursive(oldHandle, newHandle);
    } else {
      newHandle = await parentHandle.getFileHandle(newName, { create: true });
      await _copyFile(oldHandle, newHandle);
    }

    // 删旧
    await parentHandle.removeEntry(oldName, { recursive: isDir });
    return newHandle;
  } catch (e) {
    alert(`改名失败：${e.message || e}`);
    return null;
  }
}

// 同层是否存在同名条目
async function _exists(parentHandle, name, isDir) {
  try {
    if (isDir) {
      await parentHandle.getDirectoryHandle(name);
    } else {
      await parentHandle.getFileHandle(name);
    }
    return true;
  } catch {
    return false;
  }
}

// 递归复制文件夹内容：src → dst
async function _copyDirRecursive(srcHandle, dstHandle) {
  for await (const entry of srcHandle.values()) {
    if (entry.kind === 'file') {
      const newFileHandle = await dstHandle.getFileHandle(entry.name, { create: true });
      await _copyFile(entry, newFileHandle);
    } else {
      const newDirHandle = await dstHandle.getDirectoryHandle(entry.name, { create: true });
      await _copyDirRecursive(entry, newDirHandle);
    }
  }
}

// 复制单个文件：srcHandle → dstHandle
async function _copyFile(srcFileHandle, dstFileHandle) {
  const file = await srcFileHandle.getFile();
  const writable = await dstFileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}
