"""聊天 HTTP 请求/响应 Pydantic 模型。

与 ``MessageRecord`` 持久化字段对应；``MessageItem.citations`` 仅 assistant 角色携带
本轮工具登记的结构化来源（见 ``app.agent.tools._internal.citations``）。
"""

from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator


class ChatMessage(BaseModel):
    """Chat Message."""
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ConversationTitleUpdate(BaseModel):
    """Conversation Title Update."""
    title: str = Field(..., min_length=1, max_length=512)


class ChatRequest(BaseModel):
    """Chat Request."""
    message: str = Field(default="", description="本轮用户输入；可与图片 URL 同时使用")
    history: list[ChatMessage] = Field(
        default_factory=list,
        description="仅在新会话首轮有效：客户端维护的历史；传入 conversation_id 后服务端以数据库为准",
    )
    conversation_id: str | None = Field(
        default=None, description="已有会话 ID；不传则创建新会话并在首包 meta 中返回",
    )
    agent_id: str | None = Field(
        default=None, description="指定使用的 Agent ID（None 时用默认 Agent）"
    )
    anon_session_secret: str | None = Field(
        default=None,
        description="匿名会话凭证，与首包 meta.anonSessionSecret 一致；续聊与登录用户会话无关",
    )
    regenerate_last_reply: bool = Field(
        default=False,
        description="为 True 时需带 conversation_id：删除该会话最后一条用户消息之后的 thinking/assistant，"
        "不重复写入用户消息，用于「重新生成」上一轮助手回复。",
    )
    regenerate_from_user_id: str | None = Field(
        default=None,
        description="从指定 user 消息开始重新生成：删除该 user 之后的所有消息，不重复写入该 user。",
    )
    resume_kind: Literal["ask_user"] | None = Field(
        default=None,
        description="恢复一个被工具暂停的会话流程；目前仅支持 ask_user。",
    )
    resume_widget_id: str | None = Field(
        default=None,
        description="恢复 ask_user 时对应的 widget id，用于后端区分本轮不是重新生成。",
    )
    resume_trace_id: str | None = Field(
        default=None,
        description="前端 trace id，仅用于 SSE/日志关联；后端不依赖它做权限判断。",
    )
    form_submission: dict[str, str] | None = Field(
        default=None,
        description="ask_user 表单恢复：字段名 → 值（HTTPS 传输，服务端加密存 Vault，15 分钟有效）",
    )
    deep_think: bool = Field(
        default=True,
        description="为 True 时在系统提示中追加「深度思考」指令：逐步推理；若模型支持思考通道则展示推理过程。",
    )
    web_search_enabled: bool = Field(
        default=False,
        description="为 True 时在系统提示中追加联网检索（searx_web_search）策略说明。",
    )
    web_search_mode: Literal["force", "auto"] = Field(
        default="force",
        description="在 web_search_enabled 时生效：force=必须调用联网搜索；auto=由模型判断是否需要搜网。",
    )
    group_id: str | None = Field(
        default=None,
        description="仅在新建会话（未传 conversation_id）时生效：将把会话归入该分组，须为当前用户的分组 ID。",
    )
    chat_model: str | None = Field(
        default=None,
        description="可选对话模型 id：llm_provider=qwen 且配置了 QWEN_CHAT_MODEL_OPTIONS 时为 DashScope model id；"
        "llm_provider=deepseek 时为内置清单（deepseek-v4-flash / deepseek-v4-pro）；"
        "openai/glm/anthropic 须与环境变量中的单一 *_CHAT_MODEL 一致；可与 llm_provider 同时指定以切换厂商。",
    )
    llm_provider: str | None = Field(
        default=None,
        description="可选：显式指定本轮对话厂商（qwen | deepseek | openai | anthropic | glm），须在服务端已配置对应 API Key；"
        "不传时使用环境变量 LLM_PROVIDER。",
    )
    image_urls: list[str] = Field(
        default_factory=list,
        description="图片 URL（通常由 OSS 上传接口返回的签名 HTTPS 地址）；与 message 拼接为多模态用户消息。"
        "VL 模型要求每张图宽高均须大于 10px；须经上传校验通过，否则易被模型以 400 拒绝。",
    )

    @model_validator(mode="after")
    def _validate_message_and_images(self) -> Self:
        """Internal helper: validate message and images."""
        msg = self.message.strip()
        cleaned: list[str] = []
        for u in self.image_urls:
            if not isinstance(u, str):
                continue
            t = u.strip()
            if not t:
                continue
            if len(t) > 4096:
                raise ValueError("单张图片 URL 过长（最多 4096 字符）")
            if not (t.startswith("https://") or t.startswith("http://")):
                raise ValueError("image_urls 中的每一项须为 http(s) URL")
            cleaned.append(t)
        if len(cleaned) > 8:
            raise ValueError("本轮最多附带 8 张图片")
        if not msg and not cleaned:
            is_form_resume = (
                self.resume_kind == "ask_user"
                and bool((self.resume_widget_id or "").strip())
                and bool(self.form_submission)
            )
            if not is_form_resume:
                raise ValueError("请输入文字或上传图片")
        self.message = msg
        self.image_urls = cleaned
        return self


class ConversationItem(BaseModel):
    """Conversation Item."""
    id: str
    title: str
    agent_id: str | None = None
    #: 自定义 Agent 名称；agent_id 为空时由前端展示「系统默认」
    agent_name: str | None = None
    #: 该会话最新一条助手消息的 model_name
    last_model_name: str | None = None
    created_at: datetime
    group_id: str | None = None


class ConversationGroupItem(BaseModel):
    """Conversation Group Item."""
    id: str
    name: str
    sort_order: int
    created_at: datetime


class ConversationGroupCreate(BaseModel):
    """Conversation Group Create."""
    name: str = Field(..., min_length=1, max_length=128)


class ConversationGroupRename(BaseModel):
    """Conversation Group Rename."""
    name: str = Field(..., min_length=1, max_length=128)


class ConversationGroupAssign(BaseModel):
    """Conversation Group Assign."""
    group_id: str | None = Field(None, description="不传或 null 表示移出分组")


class MessageItem(BaseModel):
    """Message Item."""
    id: str
    role: str
    content: str
    created_at: datetime
    duration_sec: float | None = None
    model_name: str | None = None
    citations: list[dict] | None = Field(
        default=None,
        description="仅存于 assistant：本条回复的结构化引用来源",
    )
    follow_up_suggestions: list[str] | None = Field(
        default=None,
        description="仅存于 assistant：生成并持久化的快速追问话术",
    )


class MessageListResponse(BaseModel):
    """会话消息分页响应（默认按 created_at 升序）。"""

    messages: list[MessageItem]
    has_more: bool = Field(
        default=False,
        description="为 True 时表示还有更早的消息，可用 before 继续向上翻页",
    )


class FollowUpSuggestionsRequest(BaseModel):
    """根据助手正文生成追问建议（独立于主 SSE）。"""

    assistant_reply: str = Field(..., description="已完成的一条助手气泡全文")
    user_question: str | None = Field(
        default=None,
        description="与本条助手回复相对应的用户本轮提问（含附图时的文字部分）；便于追问贴合原问题",
        max_length=8192,
    )
    assistant_message_id: str | None = Field(
        default=None,
        max_length=36,
        description="若与 conversation_id 同时传入：将建议写入该助手消息行（UUID）",
    )
    conversation_id: str | None = Field(
        default=None,
        description="可选；传入时校验匿名会话与归属",
    )
    anon_session_secret: str | None = Field(
        default=None,
        description="匿名会话凭证；与对话接口一致",
    )
    chat_model: str | None = Field(
        default=None,
        description="已弃用：llm_provider=qwen 时追问固定使用 QWEN_FOLLOW_UP_SUGGESTIONS_MODEL（默认 qwen-flash），服务端忽略该字段",
        max_length=200,
    )


class FollowUpSuggestionsResponse(BaseModel):
    """Follow Up Suggestions Response data model."""
    suggestions: list[str] = Field(default_factory=list, description="最多 3 条，每条 ≤80 字")


class AttachmentSuggestionItem(BaseModel):
    """Attachment Suggestion Item."""
    label: str = Field(..., description="按钮短标题")
    prompt: str = Field(..., description="点击后填入/发送的完整话术")


class AttachmentSuggestionsRequest(BaseModel):
    """根据待发送图片 URL 生成附图快捷话术（VL 看图）。"""

    image_urls: list[str] = Field(
        ...,
        min_length=1,
        description="与主对话相同的 OSS 签名图片 URL 列表",
    )
    conversation_id: str | None = Field(
        default=None,
        description="可选；传入时校验匿名会话与归属（与 follow-up 一致）",
    )
    anon_session_secret: str | None = Field(
        default=None,
        description="匿名会话凭证",
    )

    @model_validator(mode="after")
    def _validate_urls(self) -> Self:
        """Internal helper: validate urls."""
        cleaned: list[str] = []
        for u in self.image_urls:
            if not isinstance(u, str):
                continue
            t = u.strip()
            if not t:
                continue
            if len(t) > 4096:
                raise ValueError("单张图片 URL 过长（最多 4096 字符）")
            if not (t.startswith("https://") or t.startswith("http://")):
                raise ValueError("image_urls 中的每一项须为 http(s) URL")
            cleaned.append(t)
        if len(cleaned) > 8:
            raise ValueError("最多 8 张图片")
        if not cleaned:
            raise ValueError("请至少提供 1 张有效图片 URL")
        self.image_urls = cleaned
        return self


class AttachmentSuggestionsResponse(BaseModel):
    """Attachment Suggestions Response data model."""
    items: list[AttachmentSuggestionItem] = Field(default_factory=list)
