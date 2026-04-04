/**
 * 将本地图片编码为 AgentRunRequest 所需的字段，供后端写入 ToolContext，
 * 从而触发 herb_image_recognition_tool（与 multipart 直连视觉模型路径区分）。
 *
 * 大图策略：当像素边过长或文件体积过大时，优先在浏览器侧用 Canvas 缩放到最长边上限并导出 JPEG，
 * 以控制 JSON 体积与 Ollama 推理负载；SVG / 解码失败时回退为原始 readAsDataURL。
 */

const DATA_URL_RE = /^data:([^;]+);base64,(.+)$/s

/** 缩放目标：最长边像素上限（药材识别一般不需 4K 原图）。 */
export const HERB_IMAGE_MAX_EDGE_PX = 1280

/** 超过该字节数则尝试走缩放 JPEG（小图保持原格式以免破坏 PNG 透明通道）。 */
export const HERB_IMAGE_RAW_BYTES_THRESHOLD = 600 * 1024

/** Canvas 导出 JPEG 质量（仅用于压缩分支）。 */
const HERB_JPEG_QUALITY = 0.88

/**
 * 解析 readAsDataURL 得到的字符串，提取 MIME 与纯 Base64 段。
 */
export function parseDataUrlPayload(dataUrl: string): {
  mime: string
  base64: string
} | null {
  const m = DATA_URL_RE.exec(dataUrl.trim())
  if (!m) return null
  return { mime: m[1], base64: m[2] }
}

/**
 * 等比缩放后的宽高（整数像素），用于 Canvas 绘制。
 */
export function computeTargetSize(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const m = Math.max(w, h)
  if (m <= maxEdge) {
    return { width: w, height: h }
  }
  const r = maxEdge / m
  return {
    width: Math.max(1, Math.round(w * r)),
    height: Math.max(1, Math.round(h * r)),
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const r = fr.result
      if (typeof r !== 'string') {
        reject(new Error('无法读取图片为 Data URL'))
        return
      }
      resolve(r)
    }
    fr.onerror = () => reject(fr.error ?? new Error('读取图片失败'))
    fr.readAsDataURL(file)
  })
}

/**
 * 若环境支持且图片「过大」，则缩放后转为 JPEG Data URL；否则返回 null 表示应走原始编码。
 */
async function maybeShrinkToJpegDataUrl(file: File): Promise<string | null> {
  if (typeof createImageBitmap !== 'function') {
    return null
  }
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return null
  }
  let bitmap: ImageBitmap | null = null
  try {
    bitmap = await createImageBitmap(file)
    const largeDim = Math.max(bitmap.width, bitmap.height)
    const needShrink =
      largeDim > HERB_IMAGE_MAX_EDGE_PX ||
      file.size > HERB_IMAGE_RAW_BYTES_THRESHOLD
    if (!needShrink) {
      return null
    }
    const { width, height } = computeTargetSize(
      bitmap.width,
      bitmap.height,
      HERB_IMAGE_MAX_EDGE_PX
    )
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return null
    }
    // 白底避免透明 PNG 在 JPEG 下出现黑边（药材照片多为不透明，影响可接受）
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    return canvas.toDataURL('image/jpeg', HERB_JPEG_QUALITY)
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}

/**
 * 读取浏览器 File，产出 herbImageBase64 / herbImageMimeType。
 * 大图优先输出 JPEG；小图保持原类型（含 PNG 透明时仍走原文件 Data URL）。
 */
export async function encodeImageFileToHerbPayload(
  file: File
): Promise<{ herbImageBase64: string; herbImageMimeType: string }> {
  const shrunk = await maybeShrinkToJpegDataUrl(file)
  if (shrunk) {
    const parsed = parseDataUrlPayload(shrunk)
    if (parsed) {
      return {
        herbImageBase64: parsed.base64,
        herbImageMimeType: 'image/jpeg',
      }
    }
  }

  const dataUrl = await readFileAsDataUrl(file)
  const parsed = parseDataUrlPayload(dataUrl)
  if (!parsed) {
    throw new Error('图片 Data URL 格式异常')
  }
  const mime =
    file.type && file.type.trim() !== ''
      ? file.type.trim()
      : parsed.mime || 'image/jpeg'
  return {
    herbImageBase64: parsed.base64,
    herbImageMimeType: mime,
  }
}
