"""中医咨询场景下的合规与安全提示文案。"""

# 流式首包等场景使用的短文案（可与系统提示长文案配合）
STREAM_SAFETY_NOTICE = (
    "本对话仅供中医药文化与知识参考，不构成诊疗意见；不适请及时就医，不可替代执业医师面诊。"
)

# 追加到系统提示末尾（长文，约束模型行为）
TCM_SYSTEM_SAFETY_APPENDIX = """

【重要提示——请务必遵守】
- 你提供的是中医药文化与知识层面的参考信息，不是医疗诊断、处方或治疗方案。
- 不得替代执业医师面诊、检查与处方；不得鼓励用户自行停药、改方或延误就医。
- 若用户描述急症、重症、妊娠用药、儿童用药等高风险情形，应明确建议其尽快就医。
- 涉及具体用药、剂量、辨证时，应说明个体差异大，须由专业中医师当面辨证后决定。
- 安全提示应简短嵌入回答，除非用户处于高风险情形，否则不要反复输出长篇免责声明。"""


def append_tcm_safety_to_system_prompt(prompt: str) -> str:
    """在系统提示后追加安全提示；已包含附录时不再重复。"""
    p = prompt or ""
    if TCM_SYSTEM_SAFETY_APPENDIX.strip() in p:
        return p
    return p.rstrip() + TCM_SYSTEM_SAFETY_APPENDIX
