# 运行时安全策略

本项目的桌面启动与打包设有一道**版本基线门控**（`scripts/check-runtime.cjs`），
对应 2026-10-21 的 Node.js 安全公告。这不是永久性安全声明——每次发布前应重新核对
官方公告与 Electron 发行说明。

## 门控规则

构建环境（CI 或打包机）的 Node 与 Electron 内嵌 Node 均须达到以下最低修订版：

| 主线 | 最低修订版 |
|---|---|
| 22.x | 22.23.4 |
| 24.x | 24.22.1 |
| 26.x | 26.12.1 |

低于基线的环境会被 `npm start` / `npm run package` 的 prestart/prepackage 钩子拦截。

## 当前状态（2026-11-06）

- 锁定 Electron **44.10.2**，内嵌 Node **24.22.2**（高于 24.x 基线）✅
- CI 使用 Node 24（最新修订版）✅
- 若日后锁定的 Electron 内嵌 Node 低于基线，按参考项目的做法：升级 Electron 至
  上游修复版；不提供绕过门控的启动建议。

## 验证

```sh
node scripts/check-runtime.cjs --electron   # 本地自检
node --test tests/test_runtime_policy.cjs    # 门控逻辑单测
```
