// AI 调用客户端（w6 精简版）：把请求发给本地 Python 代理（localhost:5000）
// API key 不经过前端
const PROXY_URL = 'http://127.0.0.1:5000/chat';

/**
 * 调用 AI，返回回复文本（非流式，一次性返回）
 * @param {string} userText    用户当前输入的问题
 * @param {string} contextText 路径上下文（getPathText 拼好的：user在节点xx的内容：...\n---\n...）
 * @returns {Promise<string>}  AI 回复文本
 */
export async function sendToAI(userText, contextText = '') {
  let resp;
  try {
    resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userText, contextText }),
    });
  } catch (e) {
    throw new Error('无法连接 AI 代理（localhost:5000），请先运行 start.bat');
  }

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data && data.error ? data.error : `HTTP ${resp.status}`;
    throw new Error('AI 代理错误：' + msg);
  }
  if (typeof data.reply !== 'string') {
    throw new Error('AI 返回格式异常，缺少 reply 字段');
  }
  return data.reply;
}
