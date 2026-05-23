/**
 * @fileoverview 知识库异步入库：XHR 上传、job 轮询与失败重试。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiHeaders, parseApiError } from "@/lib/api";
import { toast } from "sonner";
import { JOB_POLL_MS, TERMINAL } from "@/types/knowledge";
import type { IngestJobState } from "@/types/knowledge";

type UseKnowledgeUploadDeps = {
  fetchKbs: () => Promise<void>;
  invalidateDocsForKb: (kbId: string) => void;
  setError: (msg: string | null) => void;
};

/** 管理文件选择与 ingest job 进度轮询。 */
export function useKnowledgeUpload(
  token: string | null,
  { fetchKbs, invalidateDocsForKb, setError }: UseKnowledgeUploadDeps
) {
  const [uploadKbId, setUploadKbId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ingestJobs, setIngestJobs] = useState<IngestJobState[]>([]);
  const pollTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map()
  );

  const stopPoll = useCallback((jobId: string) => {
    const t = pollTimersRef.current.get(jobId);
    if (t) clearInterval(t);
    pollTimersRef.current.delete(jobId);
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/knowledge/jobs/${jobId}`, {
        headers: apiHeaders(token),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setIngestJobs((prev) =>
          prev.map((j) =>
            j.jobId === jobId ? { ...j, status: "failed", error: msg } : j
          )
        );
        stopPoll(jobId);
        toast.error(`入库状态查询失败：${msg}`);
        return;
      }
      const data = (await res.json()) as {
        status?: string;
        error?: string | null;
        phase?: string | null;
        progress?: number | null;
      };
      const st = data.status || "unknown";
      let completedKbId: string | null = null;
      setIngestJobs((prev) =>
        prev.map((j) => {
          if (j.jobId !== jobId) return j;
          const wasTerminal = TERMINAL.has(j.status);
          const errMsg = data.error ?? null;
          if (!wasTerminal && TERMINAL.has(st)) {
            if (st === "completed") {
              completedKbId = j.kbId;
              toast.success(`「${j.filename}」已入库完成`);
            } else if (st === "failed") {
              const err = (errMsg && String(errMsg).trim()) || "入库失败";
              toast.error(`「${j.filename}」${err}`);
            }
          }
          return {
            ...j,
            status: st,
            error: errMsg,
            phase: data.phase ?? j.phase,
            serverProgress: data.progress ?? j.serverProgress,
          };
        })
      );
      if (TERMINAL.has(st)) {
        stopPoll(jobId);
        if (completedKbId) {
          void fetchKbs();
          invalidateDocsForKb(completedKbId);
        }
      }
    },
    [token, fetchKbs, stopPoll, invalidateDocsForKb]
  );

  const startPoll = useCallback(
    (jobId: string) => {
      if (pollTimersRef.current.has(jobId)) return;
      void pollJob(jobId);
      const id = setInterval(() => void pollJob(jobId), JOB_POLL_MS);
      pollTimersRef.current.set(jobId, id);
    },
    [pollJob]
  );

  useEffect(() => {
    const ref = pollTimersRef;
    return () => {
      const timers = ref.current;
      for (const [, id] of timers) clearInterval(id);
      timers.clear();
    };
  }, []);

  const submitFileToIngest = useCallback(
    (file: File, kbId: string): Promise<void> => {
      if (!token) return Promise.resolve();
      const fd = new FormData();
      fd.append("file", file);

      const placeholderId = `uploading-${Date.now()}-${Math.random()}`;

      setIngestJobs((prev) => [
        ...prev,
        {
          kbId,
          filename: file.name,
          jobId: placeholderId,
          status: "uploading",
          uploadProgress: 0,
          fileBlob: file,
        },
      ]);

      return new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        const headers = apiHeaders(token);

        xhr.upload.onprogress = (e) => {
          if (!e.lengthComputable) return;
          const pct = Math.round((e.loaded / e.total) * 100);
          setIngestJobs((prev) =>
            prev.map((j) =>
              j.jobId === placeholderId ? { ...j, uploadProgress: pct } : j
            )
          );
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            let jobId: string | undefined;
            try {
              const data = JSON.parse(xhr.responseText) as { job_id?: string };
              jobId = data.job_id;
            } catch {
              /* ignore */
            }
            if (!jobId) {
              setIngestJobs((prev) =>
                prev.map((j) =>
                  j.jobId === placeholderId
                    ? { ...j, status: "failed", error: "未返回 job_id", uploadProgress: undefined }
                    : j
                )
              );
              toast.error(`「${file.name}」提交失败：未返回 job_id`);
              resolve();
              return;
            }
            setIngestJobs((prev) =>
              prev.map((j) =>
                j.jobId === placeholderId
                  ? { ...j, jobId, status: "pending", uploadProgress: undefined }
                  : j
              )
            );
            startPoll(jobId);
          } else {
            let errMsg = xhr.statusText || "上传失败";
            try {
              const body = JSON.parse(xhr.responseText) as {
                detail?: unknown;
                message?: unknown;
              };
              const d = body.detail ?? body.message;
              if (typeof d === "string") errMsg = d;
            } catch {
              /* ignore */
            }
            setIngestJobs((prev) =>
              prev.map((j) =>
                j.jobId === placeholderId
                  ? { ...j, status: "failed", error: errMsg, uploadProgress: undefined }
                  : j
              )
            );
            toast.error(`「${file.name}」提交失败：${errMsg}`);
          }
          resolve();
        };

        xhr.onerror = () => {
          const msg = "网络错误，请检查连接后重试";
          setIngestJobs((prev) =>
            prev.map((j) =>
              j.jobId === placeholderId
                ? { ...j, status: "failed", error: msg, uploadProgress: undefined }
                : j
            )
          );
          toast.error(`「${file.name}」${msg}`);
          resolve();
        };

        xhr.open("POST", `${API_BASE}/api/knowledge/${kbId}/ingest-async`);
        for (const [k, v] of Object.entries(headers)) {
          xhr.setRequestHeader(k, v);
        }
        xhr.send(fd);
      });
    },
    [token, startPoll]
  );

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!token || !uploadKbId) {
        if (!uploadKbId) toast.warning("请先选择要上传到的知识库");
        return;
      }
      setError(null);
      toast.success(`已提交 ${files.length} 个文件的入库任务，请稍候查看进度`);
      for (const file of files) {
        await submitFileToIngest(file, uploadKbId);
      }
    },
    [token, uploadKbId, submitFileToIngest, setError]
  );

  const handleRetry = useCallback(
    async (job: IngestJobState) => {
      if (!job.fileBlob) {
        toast.warning("请重新选择文件");
        return;
      }
      stopPoll(job.jobId);
      setIngestJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
      await submitFileToIngest(job.fileBlob, job.kbId);
    },
    [submitFileToIngest, stopPoll]
  );

  return {
    uploadKbId,
    setUploadKbId,
    ingestJobs,
    fileInputRef,
    handleFilesSelected,
    handleRetry,
  };
}
