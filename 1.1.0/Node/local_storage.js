// localStorage 自动保存/加载
// 字段清单/归一化统一在 json_storage.js（存档字段唯一权威），本文件只管介质读写
import { serializeNode, normalizeCanvasData } from './json_storage.js';

const STORAGE_KEY = 'canvas_nodes';

export const LocalStorage = {
  save(nodes) {
    const data = Array.from(nodes.values()).map(serializeNode);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      return normalizeCanvasData(JSON.parse(raw));
    } catch {
      return [];
    }
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
};
