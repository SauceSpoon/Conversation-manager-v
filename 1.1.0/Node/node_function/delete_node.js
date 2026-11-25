// 删除节点功能
export function createDeleteNode(nodeManager, uid) {
  return {
    name: '删除',
    run: () => {
      nodeManager.deleteNode(uid);
    }
  };
}
