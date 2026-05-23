/**
 * @fileoverview 聊天图片尺寸预检（浏览器解码最短边，与 VL 接口下限对齐）。
 */

import { CHAT_IMAGE_MIN_EDGE_PX } from "@/lib/chatAttachmentConstants";

/**
 * 用浏览器解码得到图片最短边像素；解码失败返回 null（不贸然丢弃，交由服务端 Pillow 兜底）。
 */
export async function measureImageMinEdgePx(file: File): Promise<number | null> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      return Math.min(bmp.width, bmp.height);
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

/** 是否已达到 VL 下限；null = 不可测，交由上传链路判断 */
export function imageMinEdgeOkForChatVl(px: number | null): boolean {
  if (px === null) return true;
  return px >= CHAT_IMAGE_MIN_EDGE_PX;
}
