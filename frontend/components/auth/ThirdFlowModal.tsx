/**
 * @fileoverview 第三方 OAuth 首次登录后的邮箱绑定弹窗（complete 流程）。
 */
"use client";

import { forwardRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { API_BASE, parseApiError } from "@/lib/api";
import { useCooldownTimer } from "@/hooks/useCooldownTimer";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

export type ThirdFlowModalProps = {
  provider: string;
  flowId: string;
  onClose: () => void;
  finishLogin: (token: string) => void | Promise<void>;
};

/**
 * OAuth 绑定邮箱并完成注册/登录。
 * @param finishLogin - 收到 access_token 后写入 Auth 上下文
 */
export const ThirdFlowModal = forwardRef<HTMLDivElement, ThirdFlowModalProps>(
  function ThirdFlowModal({ provider, flowId, onClose, finishLogin }, ref) {
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [nickname, setNickname] = useState("");
    const [needPw, setNeedPw] = useState(false);
    const [pending, setPending] = useState(false);
    const [hint, setHint] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [sendBusy, setSendBusy] = useState(false);
    const sendCd = useCooldownTimer();

    /** 向绑定邮箱发送 6 位验证码。 */
    const sendCode = async () => {
      setErr(null);
      if (!email.trim()) {
        setErr("请输入邮箱");
        return;
      }
      if (sendCd.left > 0 || sendBusy) return;
      setSendBusy(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/code/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        if (!res.ok) {
          const msg = await parseApiError(res);
          setErr(msg);
          toast.error(msg);
          return;
        }
        toast.success("验证码已发送，请查收邮箱");
        sendCd.start(60);
        setHint("请在邮箱中查收 6 位验证码");
      } finally {
        setSendBusy(false);
      }
    };

    /** 提交 OAuth complete：可能需要补设密码与昵称。 */
    const submitComplete = async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setPending(true);
      try {
        const body: Record<string, string | undefined> = {
          flowId,
          email: email.trim(),
          code,
          password: password || undefined,
          nickname: nickname || undefined,
        };
        const res = await fetch(
          `${API_BASE}/api/auth/oauth/${provider}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        );
        const dataRaw = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            (dataRaw && typeof dataRaw === "object" && "message" in dataRaw
              ? String((dataRaw as { message?: string }).message)
              : null) || (await parseApiError(res));
          throw new Error(msg);
        }
        const data = dataRaw as {
          need_password?: boolean;
          suggest_nickname?: string;
          access_token?: string;
        };
        if (data.need_password) {
          setNeedPw(true);
          if (data.suggest_nickname) setNickname(data.suggest_nickname);
          setPending(false);
          return;
        }
        const { access_token: at } = data;
        if (!at) throw new Error("登录失败");
        await finishLogin(at);
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : "登录失败");
      } finally {
        setPending(false);
      }
    };

    return (
      <motion.div
        ref={ref}
        className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
        {...uiModalBackdrop}
      >
        <motion.div
          className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl border border-border"
          onClick={(e) => e.stopPropagation()}
          {...uiModalPanel}
        >
          <h2 className="text-lg font-semibold mb-1">绑定邮箱</h2>
          <p className="text-sm text-muted-foreground mb-4">
            请在下方填写邮箱并完成验证，以继续使用 {provider} 登录。
          </p>
          <form onSubmit={submitComplete} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">邮箱</label>
              <input
                type="email"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="六位验证码"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                minLength={6}
                maxLength={8}
              />
              <button
                type="button"
                disabled={sendCd.left > 0 || sendBusy}
                onClick={() => void sendCode()}
                className="shrink-0 rounded-xl border border-border bg-muted px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
              >
                {sendBusy
                  ? "发送中…"
                  : sendCd.left > 0
                    ? `${sendCd.left}s 后可重发`
                    : "发送验证码"}
              </button>
            </div>
            {needPw && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">设置密码（至少 6 位）</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    required={needPw}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">昵称（可选）</label>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </div>
              </>
            )}
            {hint && !err && (
              <p className="text-sm text-green-700">{hint}</p>
            )}
            {err && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-2 py-1">{err}</p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                className="flex-1 py-2 rounded-xl border text-sm"
                onClick={onClose}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm disabled:opacity-50"
              >
                {pending ? "提交中…" : "完成绑定"}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    );
  }
);

ThirdFlowModal.displayName = "ThirdFlowModal";
