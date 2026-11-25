// 连线样式配置：全局默认 + 单条覆盖
// 以后切换主题/高亮路径都改这里
import { DEFAULT_FLOW_CONFIG } from './line_effects.js';

export const defaultEdgeStyle = {
  color: 'rgba(255,255,255,.28)', // 线条颜色（深色画布上的弱化白线）
  lineWidth: 1.5,          // 线宽
  curveType: 'bezier',     // 曲线类型：'bezier' | 'line' | 'arc'
  arrowSize: 8,            // 箭头大小（0 = 无箭头）
  arrowColor: 'rgba(255,255,255,.28)', // 箭头颜色
  dash: null,              // 虚线模式：null = 实线，[5,5] = 虚线
  opacity: 1,              // 透明度 0~1
  highlightColor: '#f4b863',// 高亮时的颜色（香槟强调）
  flow: DEFAULT_FLOW_CONFIG// 流光粒子动效（enabled 开关 + 颜色/半径/速度），定义见 line_effects.js
};
