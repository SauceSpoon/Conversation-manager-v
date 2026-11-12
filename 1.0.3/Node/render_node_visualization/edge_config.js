// 连线样式配置：全局默认（w6 精简版：去掉流光动效与高亮字段）
export const defaultEdgeStyle = {
  color: '#999',           // 线条颜色
  lineWidth: 1.5,          // 线宽
  curveType: 'bezier',     // 曲线类型：'bezier' | 'line'
  arrowSize: 8,            // 箭头大小（0 = 无箭头）
  arrowColor: '#999',      // 箭头颜色
  dash: null,              // 虚线模式：null = 实线，[5,5] = 虚线
  opacity: 1,              // 透明度 0~1
};
