# DeepAgents 1.16.0 端侧兼容实验

这是固定候选的隔离实验，生产 `mobile/package-lock.json` 仍使用 1.13.2。依赖由本目录 lockfile 复现，不将候选称为最新版本。

```powershell
cd experiments/deepagents-1.16
npm ci --ignore-scripts
npm test
node bundle.cjs --baseline
node bundle.cjs                 # 预期失败：node:crypto
node bundle.cjs --portable
../../mobile/node_modules/hermes-compiler/hermesc/win64-bin/hermesc.exe -O -emit-binary -out ../../build/deepagents-1.16/portable.hbc ../../build/deepagents-1.16/portable.bundle.js
```

需要先安装 mobile 的锁定依赖，复用其 Metro/Hermes。bundle 脚本沿用生产 resolver 的浏览器入口规则，但候选包优先从实验依赖目录解析。

2026-10-29 实测：

| 检查 | 结果 |
| --- | --- |
| SHA-256 与 Node 原生对照 | 9 个完整字节、分块、非零 offset 子数组对照通过；包含零字节、UTF-8 和 100003 字节输入 |
| 候选离线图 | pinnedSkills 正文注入、同图刷新为新内容通过 |
| 原样候选 Metro | node:crypto 解析失败 |
| 只加入 SHA-256 后 | 继续失败于 langsmith/traceable 引入 node:async_hooks |
| 两处有限范围适配后 Metro | 通过 |
| Hermes 字节码编译 | 通过；产物 5602219 字节，仅是实验入口 |

适配一只匹配候选 DeepAgents dist 对 `node:crypto` 的导入，实现它实际使用的 `createHash('sha256').update(Uint8Array).digest('hex')`，不空置任何哈希。适配二把同一调用方的 `langsmith/traceable` 改为 `langsmith/singletons/traceable`：候选实际只导入 `getCurrentRunTree`，后者正是原入口重导出的函数，且不会初始化 Node AsyncLocalStorage。不推广为全局 Node API shim。

本次不升级生产：最小入口通过并不等于完整 APK 可运行；Hermes 编译不是设备执行。尚缺完整候选 APK 的视觉输入、内部 pinned_skill 消息、流式取消、自定义模型协议、旧 graphVersion 工作区迁移验证。生产技能闭环已在 1.13.2 落地，升级不再阻塞它。后续升级必须单独通过这些门槛并提交生产 lockfile；不能将本实验通过复用为发布验收。

候选来源：[1.16.0 发布说明](https://github.com/langchain-ai/deepagentsjs/releases/tag/deepagents%401.16.0)。源码检查基于本目录 npm lockfile 的 integrity 校验安装结果。日志保存在仓库忽略的 build/deepagents-*。
