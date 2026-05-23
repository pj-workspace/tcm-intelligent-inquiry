"""会话标题生成与 SSE 展示用模型标签。"""

import asyncio

from sqlalchemy import update

from app.chat.model_display import sse_reply_model_label
from app.chat.models import ConversationRecord
from app.chat.policy.turns import ResolvedChatTurn
from app.chat.services.streaming.chunk_parsers import extract_text
from app.chat.services.streaming.sse import truncate
from app.core.ai_chat_trace import format_title_llm_call
from app.core.config import active_chat_model_label, get_settings, primary_qwen_chat_model
from app.core.database import async_session_factory
from app.core.deepseek_chat_options import primary_deepseek_chat_model_id
from app.core.logging import get_logger

logger = get_logger(__name__)


def meta_chat_model_label(rt: ResolvedChatTurn) -> str:
    """Meta chat model label (``rt``)."""
    mid = (rt.llm_chat_model_id or "").strip()
    short = active_chat_model_label(mid or None, llm_provider=rt.effective_llm_provider)
    return sse_reply_model_label(rt.effective_llm_provider, mid, short)


async def generate_title_async(
    msg_in: str,
    conv_id: str,
    *,
    chat_model_id: str | None = None,
    llm_provider: str | None = None,
) -> str:
    """异步生成标题并更新到数据库。"""
    from app.llm.chat_factory import build_chat_model

    fallback_title = truncate(msg_in, 10)
    title = fallback_title

    try:
        s = get_settings()
        lp_eff = (llm_provider or "").strip().lower() or (s.llm_provider or "qwen").strip().lower()
        ov: str | None = None
        if lp_eff == "qwen":
            qs = primary_qwen_chat_model(s)
            ov = ((chat_model_id or "").strip() or qs)
        elif lp_eff == "deepseek":
            qs = primary_deepseek_chat_model_id(settings=s)
            ov = ((chat_model_id or "").strip() or qs)
        elif lp_eff == "openai":
            ov = ((chat_model_id or "").strip() or (s.openai_chat_model or "").strip())
        elif lp_eff == "glm":
            ov = ((chat_model_id or "").strip() or (s.glm_chat_model or "").strip())
        elif lp_eff == "anthropic":
            ov = ((chat_model_id or "").strip() or (s.anthropic_chat_model or "").strip())

        model = build_chat_model(
            enable_thinking=False,
            chat_model_override=ov,
            llm_provider=lp_eff,
        )
        prompt = (
            "请根据用户的首条消息，总结出一个简短的会话标题（10个字以内）。"
            "只输出标题文本，不要包含任何标点符号、引号或额外解释。\n\n"
            f"用户消息：{msg_in}"
        )

        async def _call_model():
            """Internal helper: call model."""
            res = await model.ainvoke(prompt)
            raw = extract_text(res) if res is not None else ""
            if not raw and hasattr(res, "content"):
                raw = str(getattr(res, "content", "") or "")
            trimmed = raw.strip()
            if get_settings().ai_chat_trace_log:
                log = get_logger(__name__)
                log.info(
                    "\n%s",
                    format_title_llm_call(
                        user_message_excerpt=msg_in,
                        prompt=prompt,
                        reply_raw=trimmed or raw,
                    ),
                )
            return trimmed

        ai_title = await asyncio.wait_for(_call_model(), timeout=12.0)
        if ai_title:
            ai_title = ai_title.strip("'\"")
            title = truncate(ai_title, 10)
    except TimeoutError:
        logger.warning("generate conversation title timed out, using fallback")
    except Exception as e:
        logger.warning("Failed to generate title asynchronously: %s", e)

    try:
        async with async_session_factory() as session:
            await session.execute(
                update(ConversationRecord)
                .where(ConversationRecord.id == conv_id)
                .values(title=title)
            )
            await session.commit()
    except Exception:
        logger.exception("Failed to save generated title")

    return title
