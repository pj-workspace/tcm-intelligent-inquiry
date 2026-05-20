"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { API_BASE, parseApiError } from "@/lib/api";
import { useCooldownTimer } from "@/hooks/useCooldownTimer";
import { AnimatePresence, motion } from "framer-motion";
import { uiModalBackdrop, uiModalPanel } from "@/lib/ui-motion";

type AuthFormProps = {
  onAuthenticated: () => void;
  compact?: boolean;
  /** 首次渲染时的 Tab（用于 `/register` 等直达页） */
  initialMode?: "login" | "register";
};

import { ThirdFlowModal } from "@/components/auth/ThirdFlowModal";
import { OAuthButtons } from "@/components/auth/OAuthButtons";


function AuthFormInner({
  onAuthenticated,
  compact,
  initialMode = "login",
}: AuthFormProps) {
  const { login, register, loginWithToken, loginWithEmailCode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [username, setUsername] = useState("");
  const [emailReg, setEmailReg] = useState("");
  const [regVerifyCode, setRegVerifyCode] = useState("");
  const registerCd = useCooldownTimer();
  const forgotSendCd = useCooldownTimer();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registerSendBusy, setRegisterSendBusy] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [newPw, setNewPw] = useState("");
  const [forgotStep, setForgotStep] = useState<"email" | "reset">("email");
  const [forgotMailBusy, setForgotMailBusy] = useState(false);
  const [forgotResetBusy, setForgotResetBusy] = useState(false);
  /** 登录：密码方式 vs 邮箱验证码方式 */
  const [loginMethod, setLoginMethod] = useState<"password" | "email_code">("password");
  const [emailLogin, setEmailLogin] = useState("");
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const loginCd = useCooldownTimer();
  const [loginSendBusy, setLoginSendBusy] = useState(false);
  const [thirdModal, setThirdModal] = useState<{
    flowId: string;
    provider: string;
  } | null>(null);
  const oauthExchangeOnce = useRef(false);

  /** OAuth landing: ?code= or ?thirdFlow=&provider=&oauth_error= */
  useEffect(() => {
    const oauthErr = searchParams.get("oauth_error");
    if (oauthErr) setError(decodeURIComponent(oauthErr));

    const code = searchParams.get("code");
    const tf = searchParams.get("thirdFlow");
    const pv = searchParams.get("provider");

    if (tf && pv) {
      setThirdModal({ flowId: tf, provider: pv.toLowerCase() });
      return;
    }

    if (code && !tf && !oauthExchangeOnce.current) {
      oauthExchangeOnce.current = true;
      (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/auth/oauth/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code }),
          });
          if (!res.ok) {
            setError(await parseApiError(res));
            return;
          }
          const data = (await res.json()) as { access_token: string };
          await loginWithToken(data.access_token);
          onAuthenticated();
        } catch {
          setError("OAuth 登录失败");
        }
      })();
    }
  }, [searchParams, loginWithToken, onAuthenticated]);

  const startOAuth = async (p: "github" | "gitee") => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/oauth/${p}/authorize`);
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = (await res.json()) as { authorize_url: string };
      window.location.href = data.authorize_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法发起 OAuth");
    }
  };

  const sendRegisterCode = async () => {
    setError(null);
    const em = emailReg.trim();
    if (!em) {
      setError("请先填写邮箱");
      toast.error("请先填写邮箱");
      return;
    }
    if (registerCd.left > 0 || registerSendBusy || pending) return;
    setRegisterSendBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/code/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("验证码已发送，请查收邮箱");
      registerCd.start(60);
    } finally {
      setRegisterSendBusy(false);
    }
  };

  const sendLoginEmailCode = async () => {
    setError(null);
    const em = emailLogin.trim();
    if (!em) {
      toast.error("请先填写邮箱");
      return;
    }
    if (loginCd.left > 0 || loginSendBusy || pending) return;
    setLoginSendBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/code/send-email-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("验证码已发送，请查收邮箱");
      loginCd.start(60);
    } finally {
      setLoginSendBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      if (mode === "login") {
        if (loginMethod === "email_code") {
          const em = emailLogin.trim();
          const c = loginOtpCode.trim().replace(/\D/g, "").slice(0, 6);
          if (!em) {
            setError("请填写邮箱");
            setPending(false);
            return;
          }
          if (!/^[0-9]{6}$/.test(c)) {
            setError("请输入邮件中的 6 位数字验证码");
            setPending(false);
            return;
          }
          await loginWithEmailCode(em, c);
        } else {
          await login(username.trim(), password);
        }
      } else {
        const em = emailReg.trim();
        const vc = regVerifyCode.trim();
        if (!em) {
          setError("请填写邮箱");
          setPending(false);
          return;
        }
        if (!vc || vc.length < 6) {
          setError("请输入邮件中的 6 位验证码");
          setPending(false);
          return;
        }
        await register(username.trim(), password, em, vc);
      }
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setPending(false);
    }
  };

  const sendForgot = async () => {
    setError(null);
    const em = forgotEmail.trim();
    if (!em) {
      toast.error("请输入账户邮箱");
      return;
    }
    if (forgotSendCd.left > 0 || forgotMailBusy) return;
    setForgotMailBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/code/send-forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("验证码已发送，请查收邮箱");
      forgotSendCd.start(60);
      setForgotStep("reset");
    } finally {
      setForgotMailBusy(false);
    }
  };

  const resendForgotOnly = async () => {
    if (forgotSendCd.left > 0 || forgotMailBusy) return;
    const em = forgotEmail.trim();
    if (!em) {
      toast.error("请输入账户邮箱（可关闭弹窗后从第一步重新填写）");
      return;
    }
    setForgotMailBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/code/send-forgot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("验证码已重新发送");
      forgotSendCd.start(60);
    } finally {
      setForgotMailBusy(false);
    }
  };

  const resetForgot = async () => {
    setError(null);
    const trimmed = forgotCode.trim();
    if (!trimmed || !/^[0-9]{6}$/.test(trimmed)) {
      const msg = "请输入邮件中的 6 位数字验证码";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (newPw.length < 6) {
      const msg = "新密码至少 6 位";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (forgotResetBusy) return;
    setForgotResetBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: forgotEmail.trim(),
          code: trimmed,
          new_password: newPw,
        }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        toast.error(msg);
        return;
      }
      toast.success("密码已重置，请使用新密码登录");
      setShowForgot(false);
      setForgotStep("email");
      setError(null);
    } finally {
      setForgotResetBusy(false);
    }
  };

  const fieldShell =
    "rounded-xl border border-[#e5e5e5] bg-[#fafafa] outline-none focus:border-gray-400 focus:bg-white transition-colors";
  /** 紧凑页登录 / 注册共用同一套控件尺寸，避免 Tab 切换时跳变 */
  const fieldSize = "py-2.5 text-[15px]";
  const inpFull = `w-full px-3 ${fieldShell} ${fieldSize}`;
  const inpFlex = `min-w-0 flex-1 px-3 ${fieldShell} ${fieldSize}`;
  const lb = "mb-1.5";
  const compactBtn =
    "shrink-0 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2.5 text-[13px] font-medium whitespace-nowrap text-[#374151] hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="relative">
      {!compact && (
        <div className="flex items-center justify-center gap-2 mb-8 text-2xl font-serif text-[#1a1a1a]">
          <Sun className="w-8 h-8 text-orange-500" />
          <span>TCM 智能问诊</span>
        </div>
      )}

      <div
        className={`flex rounded-xl bg-[#f4f4f5] p-1 ${compact ? "mb-4" : "mb-6"}`}
      >
        <button
          type="button"
          onClick={() => {
            setMode("login");
            setError(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "login"
              ? "bg-white shadow-sm text-gray-900 hover:bg-gray-50/90"
              : "text-gray-500 hover:bg-white/70 hover:text-gray-700"
          }`}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setLoginMethod("password");
            setError(null);
          }}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            mode === "register"
              ? "bg-white shadow-sm text-gray-900 hover:bg-gray-50/90"
              : "text-gray-500 hover:bg-white/70 hover:text-gray-700"
          }`}
        >
          注册
        </button>
      </div>

      <form
        onSubmit={submit}
        className={compact ? "space-y-4" : "space-y-5"}
      >
        {/* 验证码登录时在顶部给出返回，避免两套「块状 Tab」并排显得笨重 */}
        {mode === "login" && loginMethod === "email_code" && (
          <div className="flex justify-start">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:text-orange-700"
              onClick={() => {
                setLoginMethod("password");
                setLoginOtpCode("");
                setError(null);
              }}
            >
              <span aria-hidden>←</span>
              返回密码登录
            </button>
          </div>
        )}

        {(mode === "register" || (mode === "login" && loginMethod === "password")) && (
          <div>
            <label className={`block text-xs font-medium text-gray-500 ${lb}`}>
              {mode === "login" ? "用户名或邮箱" : "用户名"}
            </label>
            <input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inpFull}
              placeholder={
                mode === "register" ? "至少 2 个字符" : "用户名或邮箱"
              }
              required={
                mode === "register" || (mode === "login" && loginMethod === "password")
              }
              minLength={mode === "register" ? 2 : 1}
            />
          </div>
        )}

        {mode === "register" && (
          <>
            <div>
              <label className={`block text-xs font-medium text-gray-500 ${lb}`}>
                邮箱
              </label>
              <input
                type="email"
                autoComplete="email"
                value={emailReg}
                onChange={(e) => setEmailReg(e.target.value)}
                className={inpFull}
                placeholder="请输入邮箱"
                required
              />
            </div>
            <div>
              <label className={`block text-xs font-medium text-gray-500 ${lb}`}>
                验证码
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={regVerifyCode}
                  onChange={(e) => setRegVerifyCode(e.target.value)}
                  className={`${inpFlex} tracking-[0.35em]`}
                  placeholder="6 位数字"
                  required
                  minLength={6}
                  maxLength={8}
                />
                <button
                  type="button"
                  disabled={registerCd.left > 0 || registerSendBusy || pending}
                  onClick={() => void sendRegisterCode()}
                  className={compactBtn}
                >
                  {registerSendBusy
                    ? "发送中…"
                    : registerCd.left > 0
                      ? `${registerCd.left}s 后可重发`
                      : "发送验证码"}
                </button>
              </div>
            </div>
          </>
        )}

        {mode === "login" && loginMethod === "email_code" && (
          <>
            <div>
              <label className={`block text-xs font-medium text-gray-500 ${lb}`}>邮箱</label>
              <input
                type="email"
                autoComplete="email"
                value={emailLogin}
                onChange={(e) => setEmailLogin(e.target.value)}
                className={inpFull}
                placeholder="请输入邮箱"
                required
              />
            </div>
            <div>
              <label className={`block text-xs font-medium text-gray-500 ${lb}`}>
                邮箱验证码
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={loginOtpCode}
                  onChange={(e) =>
                    setLoginOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className={`${inpFlex} tracking-[0.35em]`}
                  placeholder="6 位数字"
                  required={mode === "login" && loginMethod === "email_code"}
                  maxLength={6}
                />
                <button
                  type="button"
                  disabled={loginCd.left > 0 || loginSendBusy || pending}
                  onClick={() => void sendLoginEmailCode()}
                  className={compactBtn}
                >
                  {loginSendBusy
                    ? "发送中…"
                    : loginCd.left > 0
                      ? `${loginCd.left}s 后可重发`
                      : "发送验证码"}
                </button>
              </div>
            </div>
          </>
        )}

        {(mode === "register" || (mode === "login" && loginMethod === "password")) && (
          <div>
            <div className={`flex justify-between items-center ${lb}`}>
              <label className="block text-xs font-medium text-gray-500">
                {mode === "login" ? "密码" : "设置密码"}
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  className="text-xs font-medium text-orange-700 hover:underline"
                  onClick={() => {
                    setShowForgot(true);
                    setError(null);
                  }}
                >
                  忘记密码？
                </button>
              )}
            </div>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inpFull}
              placeholder={mode === "register" ? "至少 6 位" : ""}
              required={
                mode === "register" || (mode === "login" && loginMethod === "password")
              }
              minLength={mode === "register" ? 6 : 1}
            />
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`w-full rounded-xl bg-orange-700 text-[15px] font-semibold text-white shadow-sm ring-1 ring-orange-800/30 transition-colors hover:bg-orange-800 disabled:pointer-events-none disabled:opacity-50 ${compact ? "py-2.5" : "py-3"}`}
        >
          {pending ? "请稍候…" : mode === "register" ? "注册并登录" : "登录"}
        </button>

        {mode === "login" && loginMethod === "password" && (
          <div className="flex flex-wrap justify-center pt-2 text-[13px]">
            <button
              type="button"
              className="rounded-lg px-2 py-1.5 text-orange-700/95 transition-colors hover:bg-orange-50/90 hover:text-orange-950"
              onClick={() => {
                setLoginMethod("email_code");
                setUsername("");
                setPassword("");
                setError(null);
              }}
            >
              使用邮箱验证码登录
            </button>
          </div>
        )}

        <OAuthButtons
          compact={compact}
          onGitHub={() => startOAuth("github")}
          onGitee={() => startOAuth("gitee")}
        />
      </form>

      <AnimatePresence mode="sync">
        {showForgot && (
        <motion.div
          key="auth-forgot"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (forgotMailBusy || forgotResetBusy) return;
            setShowForgot(false);
            setForgotStep("email");
            setForgotCode("");
            setNewPw("");
          }}
          {...uiModalBackdrop}
        >
          <motion.div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[#e5e5e5]"
            onClick={(e) => e.stopPropagation()}
            {...uiModalPanel}
          >
            <h3 className="text-base font-semibold mb-1">忘记密码</h3>
            <p className="text-sm text-gray-500 mb-4">
              {forgotStep === "email"
                ? "输入你在本站注册时使用的邮箱。"
                : "邮件中的验证码 10 分钟内有效，可同时在此设置新密码。"}
            </p>
            {forgotStep === "email" ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">注册邮箱</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@example.com"
                  />
                </div>
                <button
                  type="button"
                  disabled={forgotSendCd.left > 0 || forgotMailBusy || forgotResetBusy}
                  className="w-full py-2.5 rounded-xl bg-orange-600 text-white text-sm font-medium disabled:opacity-50 hover:bg-orange-700"
                  onClick={() => void sendForgot()}
                >
                  {forgotMailBusy
                    ? "发送中…"
                    : forgotSendCd.left > 0
                      ? `${forgotSendCd.left}s 后可重发`
                      : "发送验证码"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="六位验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border px-3 py-2 text-sm tracking-widest"
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value)}
                  minLength={6}
                  maxLength={8}
                />
                <input
                  type="password"
                  placeholder="新密码至少 6 位"
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  value={newPw}
                  minLength={6}
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-[#1a1a1a] text-white text-sm font-medium hover:bg-gray-800 disabled:pointer-events-none disabled:opacity-50"
                  disabled={forgotResetBusy || forgotMailBusy}
                  onClick={() => void resetForgot()}
                >
                  {forgotResetBusy ? "提交中…" : "重置密码"}
                </button>
                <button
                  type="button"
                  disabled={forgotSendCd.left > 0 || forgotMailBusy || forgotResetBusy}
                  className="w-full py-2 text-sm text-orange-700 hover:underline disabled:opacity-40"
                  onClick={() => void resendForgotOnly()}
                >
                  {forgotMailBusy && !forgotResetBusy
                    ? "发送中…"
                    : forgotSendCd.left > 0
                      ? `${forgotSendCd.left}s 后可重新发送`
                      : "重新发送验证码"}
                </button>
              </div>
            )}
            <button
              type="button"
              className="mt-4 w-full py-2.5 text-sm text-gray-600 border rounded-xl hover:bg-gray-50"
              onClick={() => {
                setShowForgot(false);
                setForgotStep("email");
                setForgotCode("");
                setNewPw("");
              }}
            >
              关闭
            </button>
          </motion.div>
        </motion.div>
        )}

        {thirdModal && (
          <ThirdFlowModal
            key={thirdModal.flowId}
            provider={thirdModal.provider}
            flowId={thirdModal.flowId}
            onClose={() => {
              setThirdModal(null);
              router.replace("/login");
            }}
            finishLogin={async (at: string) => {
              await loginWithToken(at);
              setThirdModal(null);
              onAuthenticated();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/** useSearchParams 需 Suspense 包裹（Next.js） */
export function AuthForm(props: AuthFormProps) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12 text-gray-500 text-sm">
          加载中…
        </div>
      }
    >
      <AuthFormInner {...props} />
    </Suspense>
  );
}
