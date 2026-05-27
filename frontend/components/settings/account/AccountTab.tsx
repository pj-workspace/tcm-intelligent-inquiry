/**
 * @fileoverview 账户 Tab：资料、改密、邮箱验证码与 OAuth 绑定管理。
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Shield,
  KeyRound,
  Mail,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { useCooldownTimer } from "@/hooks/useCooldownTimer";
import { API_BASE, apiJsonHeaders, parseApiError } from "@/lib/api";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

import {
  type OAuthBinding,
  getChangePwCredentialError,
  getChangePwFormError,
  initials,
  providerDisplayName,
  SectionShell,
} from "@/components/settings/account/accountShared";
import { OAuthBindingsSection } from "@/components/settings/account/OAuthBindingsSection";

/** 账户与安全设置主 Tab。 */
export function AccountTab() {
  const { token, user } = useAuth();
  const [bindings, setBindings] = useState<OAuthBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [unbindCode, setUnbindCode] = useState<Record<string, string>>({});
  const changePwCd = useCooldownTimer();
  const unbindCd = useCooldownTimer();

  const [cpCode, setCpCode] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPwConfirm, setNewPwConfirm] = useState("");

  const [pwdSubmitAttempted, setPwdSubmitAttempted] = useState(false);

  const [credentialAttempted, setCredentialAttempted] = useState(false);

  /** credentials：先校验旧密码+新密码；email：再通过邮箱验证码完成修改 */
  type ChangePwPhase = "credentials" | "email";
  const [changePwPhase, setChangePwPhase] = useState<ChangePwPhase>("credentials");
  /** 服务端校验当前密码的请求中（第一步「下一步」） */
  const [checkPwBusy, setCheckPwBusy] = useState(false);

  /** 请求进行中，禁止重复点击发码或提交（与后端往返期间） */
  const [pwSendBusy, setPwSendBusy] = useState(false);
  const [pwSubmitBusy, setPwSubmitBusy] = useState(false);
  const [unbindSendingFor, setUnbindSendingFor] = useState<string | null>(null);
  const [unbindVerifyingFor, setUnbindVerifyingFor] = useState<string | null>(null);

  const credentialOnlyError = useMemo(
    () => getChangePwCredentialError(oldPw, newPw, newPwConfirm),
    [oldPw, newPw, newPwConfirm],
  );

  const changePwFormError = useMemo(
    () => getChangePwFormError(cpCode, oldPw, newPw, newPwConfirm),
    [cpCode, oldPw, newPw, newPwConfirm],
  );

  /** 修改密码表单字段变更：隐藏两步各自的提交提示 */
  useEffect(() => {
    setCredentialAttempted(false);
  }, [oldPw, newPw, newPwConfirm]);

  useEffect(() => {
    setPwdSubmitAttempted(false);
  }, [cpCode]);

  const [unbindModalProvider, setUnbindModalProvider] = useState<string | null>(null);
  const [changePwModalOpen, setChangePwModalOpen] = useState(false);

  const openUnbindModal = useCallback((provider: string) => {
    setUnbindModalProvider(provider);
    setUnbindCode((o) => ({ ...o, [provider]: "" }));
  }, []);

  const closeUnbindModal = useCallback(() => {
    setUnbindModalProvider(null);
  }, []);

  const closeChangePwModal = useCallback(() => {
    setChangePwModalOpen(false);
    setChangePwPhase("credentials");
    setCpCode("");
    setOldPw("");
    setNewPw("");
    setNewPwConfirm("");
    setPwdSubmitAttempted(false);
    setCredentialAttempted(false);
  }, []);

  const openChangePwModal = useCallback(() => {
    setChangePwPhase("credentials");
    setCpCode("");
    setOldPw("");
    setNewPw("");
    setNewPwConfirm("");
    setPwdSubmitAttempted(false);
    setCredentialAttempted(false);
    setChangePwModalOpen(true);
  }, []);

  /** Escape 关闭弹窗（进行中时忽略，避免半程关闭） */
  useEffect(() => {
    const block =
      (unbindModalProvider && (unbindVerifyingFor || unbindSendingFor)) ||
      (changePwModalOpen && (pwSubmitBusy || pwSendBusy || checkPwBusy));
    if ((!unbindModalProvider && !changePwModalOpen) || block) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (changePwModalOpen) closeChangePwModal();
        else closeUnbindModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    unbindModalProvider,
    changePwModalOpen,
    unbindVerifyingFor,
    unbindSendingFor,
    pwSubmitBusy,
    pwSendBusy,
    checkPwBusy,
    closeUnbindModal,
    closeChangePwModal,
  ]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadErr(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/oauth/bindings`, {
        headers: apiJsonHeaders(token),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      setBindings(Array.isArray(data) ? data : []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const notifyErr = (msg: string) => toast.error(msg);

  const sendUnbindCodeFor = async (provider: string) => {
    if (!token || !user?.email) {
      toast.error("请先绑定邮箱后再解绑第三方");
      return;
    }
    if (unbindCd.left > 0) return;
    if (unbindSendingFor === provider || unbindVerifyingFor === provider) return;
    setUnbindSendingFor(provider);
    try {
      const res = await fetch(
        `${API_BASE}/api/auth/oauth/${provider}/unbind/code/send`,
        { method: "POST", headers: apiJsonHeaders(token) }
      );
      if (!res.ok) notifyErr(await parseApiError(res));
      else {
        toast.success("验证码已发送");
        unbindCd.start(60);
      }
    } finally {
      setUnbindSendingFor(null);
    }
  };

  const verifyUnbind = async (provider: string) => {
    if (!token) return;
    if (unbindVerifyingFor === provider || unbindSendingFor === provider) return;
    const code = unbindCode[provider]?.trim();
    if (!code) {
      notifyErr("请输入验证码");
      return;
    }
    if (!/^[0-9]{6}$/.test(code)) {
      notifyErr("验证码须为 6 位数字");
      return;
    }
    setUnbindVerifyingFor(provider);
    try {
      const res = await fetch(
        `${API_BASE}/api/auth/oauth/${provider}/unbind/verify`,
        {
          method: "POST",
          headers: apiJsonHeaders(token),
          body: JSON.stringify({ code }),
        }
      );
      if (!res.ok) notifyErr(await parseApiError(res));
      else {
        toast.success("已解除绑定");
        setUnbindCode((o) => ({ ...o, [provider]: "" }));
        setUnbindModalProvider(null);
        await load();
      }
    } finally {
      setUnbindVerifyingFor(null);
    }
  };

  const sendChangePwCode = async () => {
    if (!token) return;
    if (!user?.email) {
      toast.error("请先绑定邮箱");
      return;
    }
    if (changePwCd.left > 0) return;
    if (pwSendBusy || pwSubmitBusy) return;
    setPwSendBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/code/send-change-password`, {
        method: "POST",
        headers: apiJsonHeaders(token),
      });
      if (!res.ok) notifyErr(await parseApiError(res));
      else {
        toast.success("验证码已发送");
        changePwCd.start(60);
      }
    } finally {
      setPwSendBusy(false);
    }
  };

  /** 第一步：本地校验新密码一致后请求服务端校验当前密码，通过后进入邮箱验证并发码 */
  const submitCredentialStep = async () => {
    if (!token) return;
    setCredentialAttempted(true);
    const ce = getChangePwCredentialError(oldPw, newPw, newPwConfirm);
    if (ce) return;
    if (checkPwBusy || pwSendBusy || pwSubmitBusy) return;
    setCheckPwBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/check-password`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({ password: oldPw }),
      });
      if (!res.ok) {
        notifyErr(await parseApiError(res));
        return;
      }
      setChangePwPhase("email");
      setCpCode("");
      await sendChangePwCode();
    } finally {
      setCheckPwBusy(false);
    }
  };

  const backToCredentialStep = () => {
    setChangePwPhase("credentials");
    setCpCode("");
    setPwdSubmitAttempted(false);
  };

  const submitChangePw = async () => {
    if (!token) return;
    if (changePwPhase !== "email") return;
    const err = getChangePwFormError(cpCode, oldPw, newPw, newPwConfirm);
    if (err) {
      setPwdSubmitAttempted(true);
      return;
    }
    if (pwSubmitBusy || pwSendBusy) return;
    setPwSubmitBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: apiJsonHeaders(token),
        body: JSON.stringify({
          code: cpCode.trim(),
          old_password: oldPw,
          new_password: newPw,
        }),
      });
      if (!res.ok) notifyErr(await parseApiError(res));
      else {
        toast.success("密码已更新，请妥善保管");
        closeChangePwModal();
      }
    } finally {
      setPwSubmitBusy(false);
    }
  };

  const emailBadge = user?.email ? (
    user.email_verified ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200/80">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已验证
      </span>
    ) : (
      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/70">
        待验证
      </span>
    )
  ) : null;

  return (
    <div className="space-y-8 pb-12">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">账号与安全</h1>
      </header>

      {loadErr && (
        <div className="flex gap-3 rounded-xl border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-800 shadow-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{loadErr}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-card-border bg-surface shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-lg font-semibold text-white shadow-md ring-2 ring-orange-100">
              {user?.username ? initials(user.username) : "—"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{user?.username ?? "—"}</p>
              {user?.email ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate text-[13px] text-foreground">{user.email}</span>
                  {emailBadge}
                </div>
              ) : (
                <p className="mt-3 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50/95 px-3 py-2 text-xs leading-snug text-amber-950 ring-1 ring-amber-200/80">
                  <span className="font-medium">未绑定邮箱</span>
                  <span className="text-amber-900/85">
                    无法在设置页重置密码或解绑第三方，请先到登录页绑定。
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

            <OAuthBindingsSection
        loading={loading}
        bindings={bindings}
        hasEmail={Boolean(user?.email)}
        onUnbind={openUnbindModal}
      />

      <SectionShell icon={KeyRound} title="修改密码">
        {!user?.email ? (
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-5 text-[13px] text-amber-950">
            <div className="flex gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                未绑定邮箱时无法在此修改密码，请先在登录页完成邮箱绑定或 OAuth 补全。
              </p>
            </div>
          </div>
        ) : (
          <div className="max-w-xl space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              先填写当前密码与新密码，验证通过后再收取邮箱验证码完成修改。
            </p>
            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground shadow-sm transition-colors hover:opacity-90 sm:w-auto sm:min-w-[10rem]"
              onClick={() => openChangePwModal()}
            >
              修改密码
            </button>
          </div>
        )}
      </SectionShell>

      <AnimatePresence>
        {changePwModalOpen && user?.email ? (
          <motion.div
            key="account-change-pw"
            className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-pw-modal-title"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              if (pwSubmitBusy || pwSendBusy || checkPwBusy) return;
              closeChangePwModal();
            }}
            {...uiModalBackdrop}
          >
            <motion.div
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-card-border bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
              {...uiModalPanel}
            >
            <button
              type="button"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
              disabled={pwSubmitBusy || pwSendBusy || checkPwBusy}
              onClick={() => closeChangePwModal()}
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="border-b border-card-header-border bg-gradient-to-br from-orange-50/60 via-surface to-transparent dark:from-orange-950/40 px-6 pb-5 pt-6">
              <h2 id="change-pw-modal-title" className="pr-10 text-lg font-semibold text-foreground">
                修改密码
              </h2>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {changePwPhase === "credentials" ? (
                  <>
                    <span className="font-medium text-muted-foreground">步骤 1/2：</span>
                    验证当前密码并设置新密码。
                  </>
                ) : (
                  <>
                    <span className="font-medium text-muted-foreground">步骤 2/2：</span>
                    输入绑定邮箱收到的 6 位验证码以完成修改（可在此重发）。
                  </>
                )}
              </p>
            </div>
            {changePwPhase === "credentials" ? (
              <form
                className="flex flex-col gap-4 p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCredentialStep();
                }}
              >
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="cp-old-modal"
                      className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      当前密码
                    </label>
                    <input
                      id="cp-old-modal"
                      type="password"
                      autoComplete="current-password"
                      className={`mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px] shadow-inner outline-none focus:bg-surface ${oldPw.length === 0 && newPw.length > 0 ? "border-amber-200" : "border-border"} focus:border-border`}
                      value={oldPw}
                      onChange={(e) => setOldPw(e.target.value)}
                      placeholder="当前登录密码"
                    />
                  </div>
                  <div>
                    <label htmlFor="cp-new-modal" className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      新密码
                    </label>
                    <input
                      id="cp-new-modal"
                      type="password"
                      autoComplete="new-password"
                      className={`mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px] shadow-inner outline-none focus:bg-surface ${newPw.length > 0 && newPw.length < 6 ? "border-amber-300" : "border-border"} focus:border-border`}
                      value={newPw}
                      minLength={6}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="至少 6 位"
                    />
                  </div>
                  <div>
                    <label htmlFor="cp-new2-modal" className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      确认新密码
                    </label>
                    <input
                      id="cp-new2-modal"
                      type="password"
                      autoComplete="new-password"
                      className={`mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-[14px] shadow-inner outline-none focus:bg-surface ${newPwConfirm.length > 0 && newPwConfirm !== newPw ? "border-amber-400" : "border-border"} focus:border-border`}
                      value={newPwConfirm}
                      minLength={6}
                      onChange={(e) => setNewPwConfirm(e.target.value)}
                      placeholder="再次输入新密码"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={checkPwBusy || pwSendBusy || pwSubmitBusy}
                  className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
                >
                  {checkPwBusy ? "验证中…" : "下一步：发送邮箱验证码"}
                </button>
                {credentialAttempted && credentialOnlyError ? (
                  <p className="text-left text-[12px] text-amber-800/95" role="status">
                    {credentialOnlyError}
                  </p>
                ) : null}
              </form>
            ) : (
              <form
                className="flex flex-col gap-4 p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitChangePw();
                }}
              >
                <button
                  type="button"
                  disabled={pwSubmitBusy || pwSendBusy || checkPwBusy}
                  className="self-start rounded-lg px-2 py-1 text-[13px] font-medium text-orange-800/95 hover:bg-orange-50/90 hover:underline disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => backToCredentialStep()}
                >
                  ← 上一步修改密码
                </button>
                <div>
                  <label
                    htmlFor="cp-code-modal"
                    className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    邮箱验证码
                  </label>
                  <div className="mt-1.5 space-y-2 sm:relative sm:min-h-[44px] sm:overflow-hidden sm:rounded-xl sm:border sm:bg-background sm:pl-3 sm:transition focus-within:sm:border-border focus-within:sm:bg-surface focus-within:sm:ring-2 focus-within:sm:ring-orange-500/15 sm:focus-within:ring-2 sm:focus-within:ring-orange-500/15">
                    <input
                      id="cp-code-modal"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-invalid={cpCode.length > 0 && cpCode.length !== 6}
                      className={`h-[42px] w-full rounded-xl border bg-background px-3 py-2 text-[14px] outline-none placeholder:text-muted-foreground sm:border-0 sm:bg-transparent sm:py-2 sm:pl-0 sm:pr-[8.75rem] ${
                        cpCode.length > 0 && cpCode.length < 6
                          ? "border-amber-300"
                          : "border-border"
                      }`}
                      value={cpCode}
                      onChange={(e) => setCpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="6 位数字"
                      maxLength={6}
                    />
                    <button
                      type="button"
                      disabled={changePwCd.left > 0 || pwSendBusy || pwSubmitBusy || checkPwBusy}
                      onClick={() => void sendChangePwCode()}
                      className="w-full truncate rounded-full border border-orange-200/95 bg-gradient-to-b from-orange-50 to-orange-100/85 px-3.5 py-2 text-[12px] font-semibold text-orange-950 shadow-sm hover:from-orange-100 hover:to-orange-100/90 disabled:pointer-events-none disabled:opacity-50 sm:absolute sm:right-1.5 sm:top-1/2 sm:w-auto sm:max-w-[min(10rem,calc(100%-8px))] sm:-translate-y-1/2 sm:py-1.5"
                      title={changePwCd.left > 0 ? `${changePwCd.left} 秒后可发送` : undefined}
                    >
                      {pwSendBusy
                        ? "发送中…"
                        : changePwCd.left > 0
                          ? `${changePwCd.left}s 后可发`
                          : "重发验证码"}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={pwSubmitBusy || pwSendBusy || checkPwBusy}
                  className="w-full rounded-xl bg-primary py-3 text-[14px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:pointer-events-none disabled:opacity-60"
                >
                  {pwSubmitBusy ? "提交中…" : "确认修改密码"}
                </button>
                {pwdSubmitAttempted && changePwFormError ? (
                  <p className="text-left text-[12px] text-amber-800/95" role="status">
                    {changePwFormError}
                  </p>
                ) : null}
              </form>
            )}
          </motion.div>
        </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {unbindModalProvider ? (
          <motion.div
            key={`account-unbind-${unbindModalProvider}`}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unbind-modal-title"
            onClick={(e) => {
              if (e.target !== e.currentTarget) return;
              if (
                unbindVerifyingFor === unbindModalProvider ||
                unbindSendingFor === unbindModalProvider
              ) {
                return;
              }
              closeUnbindModal();
            }}
            {...uiModalBackdrop}
          >
            <motion.div
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-card-border bg-surface shadow-[0_8px_40px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
              {...uiModalPanel}
            >
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none"
              disabled={
                unbindVerifyingFor === unbindModalProvider || unbindSendingFor === unbindModalProvider
              }
              onClick={() => closeUnbindModal()}
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
            <div className="border-b border-card-header-border bg-gradient-to-br from-orange-50/60 via-surface to-transparent dark:from-orange-950/40 px-6 pb-5 pt-6">
              <h2 id="unbind-modal-title" className="pr-10 text-lg font-semibold text-foreground">
                解除「{providerDisplayName(unbindModalProvider)}」绑定
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                将向「{user?.email ?? "—"}」发送验证码。解绑后仍可使用用户名/邮箱和密码登录。
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="space-y-2 sm:relative sm:min-h-[44px] sm:overflow-hidden sm:rounded-xl sm:border sm:bg-background sm:pl-3 sm:transition focus-within:sm:border-border focus-within:sm:bg-surface focus-within:sm:ring-2 focus-within:sm:ring-orange-500/15">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="请输入 6 位验证码"
                  className={`h-[42px] w-full rounded-xl border bg-background px-3 py-2 text-[14px] tracking-wide outline-none placeholder:text-muted-foreground sm:border-0 sm:bg-transparent sm:py-2 sm:pl-0 sm:pr-[10.5rem] ${
                    (unbindCode[unbindModalProvider]?.length ?? 0) > 0 &&
                    (unbindCode[unbindModalProvider]?.length ?? 0) < 6
                      ? "border-amber-300"
                      : "border-border"
                  }`}
                  value={unbindCode[unbindModalProvider] ?? ""}
                  maxLength={8}
                  onChange={(e) =>
                    setUnbindCode((o) => ({
                      ...o,
                      [unbindModalProvider]: e.target.value.replace(/\D/g, "").slice(0, 8),
                    }))
                  }
                />
                <button
                  type="button"
                  disabled={
                    unbindCd.left > 0 ||
                    unbindSendingFor === unbindModalProvider ||
                    unbindVerifyingFor === unbindModalProvider
                  }
                  className="w-full truncate rounded-full border border-orange-200/95 bg-gradient-to-b from-orange-50 to-orange-100/85 px-3 py-2 text-[12px] font-semibold text-orange-950 shadow-sm hover:from-orange-100 hover:to-orange-100/90 disabled:pointer-events-none disabled:opacity-50 sm:absolute sm:right-1.5 sm:top-1/2 sm:w-auto sm:max-w-[calc(100%-12px)] sm:-translate-y-1/2 sm:py-1.5"
                  title={unbindCd.left > 0 ? `${unbindCd.left} 秒后可发送` : "发送解绑验证码到邮箱"}
                  onClick={() => void sendUnbindCodeFor(unbindModalProvider)}
                >
                  {unbindSendingFor === unbindModalProvider
                    ? "发送中…"
                    : unbindCd.left > 0
                      ? `${unbindCd.left}s 后可发`
                      : "发送验证码"}
                </button>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    unbindVerifyingFor === unbindModalProvider ||
                    unbindSendingFor === unbindModalProvider
                  }
                  className="rounded-xl border border-border px-4 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  onClick={() => closeUnbindModal()}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={unbindVerifyingFor === unbindModalProvider || unbindSendingFor === unbindModalProvider}
                  className="rounded-xl bg-primary px-5 py-2.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => void verifyUnbind(unbindModalProvider)}
                >
                  {unbindVerifyingFor === unbindModalProvider ? "解绑中…" : "确认解绑"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
        ) : null}
      </AnimatePresence>

    </div>
  );
}
