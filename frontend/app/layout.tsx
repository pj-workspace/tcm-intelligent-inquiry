/**
 * @fileoverview 应用根布局：字体变量、全局样式与 Providers 包裹。
 */
import type { Metadata } from "next";
import { Inter, Noto_Serif_SC } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const notoSerifSC = Noto_Serif_SC({
  variable: "--font-noto-serif-sc",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "TCM Intelligent Inquiry",
  description: "AI-powered Traditional Chinese Medicine Assistant",
};

/** 根 HTML 壳：挂载字体 CSS 变量与全局 Auth/Toast Providers。 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${notoSerifSC.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#f9f9f8] text-[#1a1a1a] font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
