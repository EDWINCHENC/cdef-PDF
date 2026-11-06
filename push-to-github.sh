#!/usr/bin/env bash
# CDEF PDF Studio — 一键推送到 GitHub
# 在"终端"App 里运行本脚本即可（会弹窗要求 GitHub 用户名 + Personal Access Token）
set -e
cd "/Users/chen/Desktop/cdef_agent/chattoknow/sessions/2026-11-06_wps-pdf-windows-clone"

echo "==> 切换到 HTTPS 远程（弹窗输入用）"
git remote set-url origin https://github.com/EDWINCHENC/cdef-PDF.git

echo "==> 推送 main 分支（19 个提交）"
git push -u origin main

echo "==> 推送 v0.1.0 tag（触发 CI 自动构建 Windows 安装包）"
git push origin v0.1.0

echo "==> 恢复 SSH 远程（供后续 agent 推送）"
git remote set-url origin git@github.com:EDWINCHENC/cdef-PDF.git

echo ""
echo "✅ 完成！去仓库页面看 CI："
echo "   https://github.com/EDWINCHENC/cdef-PDF/actions"
echo "   约 15-20 分钟后在 Artifacts 下载 Windows 安装包"
