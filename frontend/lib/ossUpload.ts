/**
 * @fileoverview OSS 聊天图片上传（XHR + 可选进度回调）。
 */

import { API_BASE } from "@/lib/api";

/** 上传单张聊天图片至后端 OSS，返回签名 GET URL（供 VL 拉图）。支持上传进度回调（ XMLHttpRequest ，单文件维度 0~1）。 */
export function uploadOssChatImageWithProgress(
  token: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/storage/oss/chat-image`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.responseType = "text";
    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(1, Math.max(0, ev.loaded / ev.total)));
        return;
      }
      // 无 Content-Length 时仍给可观察的渐进读数（结束前 onload 会推到 1）
      if (ev.loaded > 0) {
        const p = 1 - Math.exp(-ev.loaded / (600 * 1024));
        onProgress(Math.min(0.96, Math.max(0.02, p)));
      }
    };
    xhr.onerror = () => reject(new Error("网络异常，上传中断"));
    xhr.onabort = () => reject(new Error("上传已取消"));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = xhr.statusText || `HTTP ${xhr.status}`;
        try {
          const j = JSON.parse(xhr.responseText || "{}") as { detail?: unknown };
          if (typeof j.detail === "string" && j.detail) detail = j.detail;
        } catch {
          /* ignore */
        }
        reject(new Error(detail));
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText || "{}") as { url?: string };
        if (!data.url || typeof data.url !== "string") {
          reject(new Error("响应格式异常"));
          return;
        }
        onProgress?.(1);
        resolve(data.url);
      } catch {
        reject(new Error("响应格式异常"));
      }
    };
    const fd = new FormData();
    fd.append("file", file);
    onProgress?.(0);
    xhr.send(fd);
  });
}

/** 无 onProgress 时与带空回调行为一致。 */
export function uploadOssChatImage(token: string, file: File): Promise<string> {
  return uploadOssChatImageWithProgress(token, file);
}
