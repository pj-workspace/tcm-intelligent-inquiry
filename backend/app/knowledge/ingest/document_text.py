"""从常见文档格式提取纯文本（入库前）。"""

from io import BytesIO

from app.core.exceptions import ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)


def _extract_pdf(content: bytes) -> str:
    """Internal helper: extract pdf."""
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    parts: list[str] = []
    for page in reader.pages:
        try:
            t = page.extract_text()
        except Exception as exc:
            logger.warning("PDF 单页提取失败: %s", exc)
            t = ""
        if t:
            parts.append(t)
    return "\n".join(parts).strip()


def _extract_docx(content: bytes) -> str:
    """Internal helper: extract docx."""
    from docx import Document

    doc = Document(BytesIO(content))
    lines = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    return "\n".join(lines).strip()


def extract_plain_text(filename: str, content: bytes) -> str:
    """按扩展名选择解析器；未知类型按 UTF-8 文本兜底。"""
    if not content:
        raise ValidationError("文件内容为空")

    name = (filename or "unknown").lower()
    if name.endswith(".pdf"):
        text = _extract_pdf(content)
        if not text:
            raise ValidationError("无法从 PDF 中提取文本（可能为扫描件或加密文件），请先 OCR 或导出为文本。")
        return text

    if name.endswith(".docx"):
        text = _extract_docx(content)
        if not text:
            raise ValidationError("Word 文档中未解析到正文，请确认文件非空。")
        return text

    if name.endswith(".doc"):
        raise ValidationError(
            "暂不支持旧版 .doc 格式，请将文件另存为 .docx 或导出为 PDF 后再上传。"
        )

    if name.endswith((".txt", ".md", ".csv", ".json", ".xml", ".html", ".htm")):
        return content.decode("utf-8", errors="replace").strip()

    # 无扩展名或其它：尝试 UTF-8
    text = content.decode("utf-8", errors="replace").strip()
    if text:
        return text
    raise ValidationError(
        f"无法解析文件「{filename}」：请使用 .pdf、.docx 或纯文本类格式。"
    )
