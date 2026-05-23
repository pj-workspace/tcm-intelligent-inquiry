/**
 * @fileoverview 登录页 Server 入口：渲染客户端登录/注册表单壳。
 */
import { LoginPageClient } from "./login-client";

/** 登录页：默认以登录模式挂载 `LoginPageClient`。 */
export default async function LoginPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | string[][] | undefined>>;
}>) {
  await Promise.all([params, searchParams]);
  return <LoginPageClient />;
}
