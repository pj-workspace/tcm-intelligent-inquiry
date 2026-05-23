/**
 * @fileoverview 登录/注册客户端页：品牌区 + `AuthForm`，成功后跳转 `/chat`。
 */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { AuthForm } from "@/components/auth/AuthForm";
import { AppLogo } from "@/components/brand/AppLogo";

/**
 * 登录或注册表单页。
 * @param initialMode - 首次展示登录还是注册 Tab
 */
export function LoginPageClient({
  initialMode = "login",
}: Readonly<{ initialMode?: "login" | "register" }>) {
  const router = useRouter();

  return (
    <div className="bg-[#fdfdfc] px-4 py-8 sm:py-10">
      <main className="mx-auto w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full shrink-0"
        >
          <div className="rounded-2xl border border-[#e5e5e5] bg-white p-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)] sm:p-7">
            <div className="mb-5 flex flex-col items-center gap-2 text-center">
              <AppLogo size={64} className="rounded-2xl shadow-sm ring-1 ring-black/[0.06]" priority />
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-gray-900">中医智询</h1>
                <p className="mt-0.5 text-sm text-gray-500">TCM Intelligent Inquiry</p>
              </div>
            </div>
            <AuthForm
              compact
              initialMode={initialMode}
              onAuthenticated={() => {
                router.push("/chat");
                router.refresh();
              }}
            />
          </div>

          <p className="mt-5 text-center">
            <Link
              href="/chat"
              className="text-sm text-gray-500 underline-offset-4 hover:text-gray-800 hover:underline"
            >
              ← 返回对话
            </Link>
          </p>
        </motion.div>
      </main>
    </div>
  );
}
