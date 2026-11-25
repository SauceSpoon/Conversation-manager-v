# 思考模式通用状态（跨路径共享，与 ai_proxy.py 平级）
# 职责：只存"思考开关 + 强度"两个状态，并提供 OpenAI 格式的参数转换
# 边界：
#   1. 不属于任何厂商——local_txt/ 和将来的 api_platform/ 都可以读本模块
#   2. 各厂商路径自己负责把这里的通用状态翻译成自家请求格式
#   3. 当前阶段仅独立存在：ai_proxy / deepseek_direct 暂不读取、不导入，
#      前端按钮也还不影响 /chat 请求；接入方式后续再定
#
# OpenAI 格式（DeepSeek 官方文档）：
#   开关：{"thinking": {"type": "enabled" / "disabled"}}
#   强度：{"reasoning_effort": "low" / "high" / "max"}（仅开启时有意义）

# 合法强度档位
EFFORTS = ('low', 'high', 'max')
DEFAULT_EFFORT = 'high'

# 模块级状态（进程内存，不持久化；重启代理回默认关闭）
_state = {
    'enabled': False,
    'effort': DEFAULT_EFFORT,
}


def get_thinking():
    """返回当前思考状态副本：{enabled: bool, effort: str}"""
    return dict(_state)


def set_thinking(enabled, effort=None):
    """更新思考状态。
       enabled: 真值=开，假值=关
       effort:  可选，必须是 low/high/max，非法值忽略不报错
       返回更新后的状态副本。"""
    _state['enabled'] = bool(enabled)
    if effort in EFFORTS:
        _state['effort'] = effort
    return dict(_state)


def to_openai_params(state=None):
    """把通用状态翻译成 OpenAI 格式的请求参数（dict），供各路径 merge 进 payload。
       关闭：{"thinking": {"type": "disabled"}}
       开启：{"thinking": {"type": "enabled"}, "reasoning_effort": <effort>}
       注：转换函数已就绪，当前没有调用方（接入时在各厂商 adapter 的 payload 组装处 merge）。"""
    s = state or _state
    if not s.get('enabled'):
        return {'thinking': {'type': 'disabled'}}
    effort = s.get('effort', DEFAULT_EFFORT)
    if effort not in EFFORTS:
        effort = DEFAULT_EFFORT
    return {
        'thinking': {'type': 'enabled'},
        'reasoning_effort': effort,
    }
