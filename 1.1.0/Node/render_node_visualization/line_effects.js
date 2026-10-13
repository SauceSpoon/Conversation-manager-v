// 连线动效：流光粒子（沿三次贝塞尔曲线从父节点流到子节点，到末端循环）
// 职责：
//   1. cubicBezierPoint：三次贝塞尔任意参数 t(0~1) 处的坐标采样
//   2. drawFlowingDot：画发光小圆点（实心核 + 径向渐变光晕）
//   3. FlowAnimation：requestAnimationFrame 动画时钟（启停管理，无连线时不跑，省 CPU）
//   4. DEFAULT_FLOW_CONFIG：动效默认配置（经 edge_config.js 的 flow 字段暴露开关）
// 边界：不管理 edges 数据、不计算节点中心、不知道 view 变换 —— 只负责"沿曲线采样 + 画粒子 + 跑时钟"
// 由 edge_renderer.js 调用

export const DEFAULT_FLOW_CONFIG = {
  enabled: true,     // 开关：true = 开启流光粒子
  color: '#1976d2',   // 粒子颜色（光晕同源，自动渐隐到透明）
  radius: 2.65,        // 粒子实心核半径（px）
  speed: 0.0012,       // 前进速度：每帧 t 增量；0.006 ≈ 2.8 秒走完整条线（60fps）
  glow: true          // 是否带光晕
};

// 三次贝塞尔参数方程：B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
// P0/P3 为起终点，P1/P2 为两个控制点（须与 edge_renderer._drawEdge 的贝塞尔控制点一致）
export function cubicBezierPoint(t, p0, p1, p2, p3) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y
  };
}

// #rgb / #rrggbb → rgba 字符串（光晕渐变末端需要"同色透明"）
function hexToRgba(hex, alpha) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// 在 p 处画一个流光粒子：径向渐变光晕（半径 3 倍）+ 实心核
export function drawFlowingDot(ctx, p, config) {
  ctx.save();
  if (config.glow) {
    const glowR = config.radius * 3;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowR);
    g.addColorStop(0, hexToRgba(config.color, 0.55));
    g.addColorStop(1, hexToRgba(config.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = config.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, config.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// 动画时钟：edge_renderer 每帧在 onFrame 里推进 t 并重绘
// start 幂等（重复调用不叠加 rAF）；stop 后粒子停在当前位置（最后一帧保留在画布上）
export class FlowAnimation {
  constructor(onFrame) {
    this.onFrame = onFrame;
    this._raf = null;
  }

  start() {
    if (this._raf) return;
    const loop = () => {
      this.onFrame?.();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  get running() {
    return !!this._raf;
  }
}
