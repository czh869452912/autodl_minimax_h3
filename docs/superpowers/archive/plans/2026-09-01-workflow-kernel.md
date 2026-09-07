# B 阶段：本地优先工作流内核实施计划

> 目标：在不引入外部应用服务器、云端管理服务或远程可执行代码的前提下，把工作流从硬编码定义升级为可校验、可回滚、可扩展的本地 WorkflowPackage/Registry 内核，并让 CreateForm 通过活动指针驱动。

## 约束与验收标准

- 仅允许用户配置的 LLM/生成 API，以及固定仓库的 HTTPS 发布订阅；不实现云端管理面板。
- 远程内容只能是签名的声明式 JSON 数据；禁止动态脚本、插件代码、远程 `$ref` 和任意 URL。
- 安装路径必须为：下载 → 大小/格式校验 → 内容 hash → 签名/提交证明 → schema/兼容性校验 → 暂存 upsert → 原子切换 active 指针。
- `discoverWorkflows()` 只返回每个 workflow 的 active 版本；若活动指针损坏，保留旧指针并回退到最后可用版本。
- 兼容性必须同时检查 app semver、adapter id/version、artifact kind。
- 运行时使用 JSON Pointer（RFC 6901）读取输入和绑定，兼容旧版 dotted binding 的本地数据迁移只保留在编译器边界。
- B 阶段不实现原生 Git CLI/GPG/SSH 解析；实现设备端可验证的 Ed25519 commit-attestation（仓库、ref、commit、tree/content hash 均在签名载荷中），并把验证器抽象为接口，未来可替换为原生 Git 签名验证器。
- 主要验收：新增 package/compiler/registry/runtime/UI 测试；`npm run typecheck` 与完整 Jest 通过（Android 构建若缺少 Java 仅报告环境阻塞）。

## 任务 1：定义 WorkflowPackage 与兼容解析边界（先写测试）

文件：`mobile/src/workflows/schema/types.ts`、`mobile/src/workflows/schema/package.ts`、对应测试。

1. 为 package envelope、metadata、adapter、inputSchema、uiSchema、bindings、outputs、capabilities、limits、compatibility、signature 建立严格 TypeScript 类型。
2. 实现 `parseWorkflowPackage`：检查 `apiVersion/kind`、id/version、contentHash 格式、签名字段和声明式边界；拒绝 executable/script/url/ref 等字段。
3. 实现 legacy `WorkflowDefinition` → `WorkflowPackage`/compiled definition 的适配器，使当前 builtin JSON 能无感迁移。
4. 保持 renderer 现有 `WorkflowDefinition` API，所有新 package 在进入 renderer/runtime 前必须经过单一编译边界。

## 任务 2：JSON Pointer 编译器与 schema 值校验（严格 RED→GREEN）

文件：`mobile/src/workflows/compiler/jsonPointer.ts`、`compiler.ts`、测试。

1. 覆盖 root pointer、`~0/~1` 解码、数组索引、非法 pointer、原型污染键和深度/节点上限。
2. 实现递归 `validateSchemaValue`，至少支持 object/array/string/number/integer/boolean、required、enum、const、长度/数值/数量限制和 `anyOf/oneOf`；错误返回稳定 path/code。
3. 实现 `compileWorkflow`，按 contentHash 缓存不可变 compiled plan，生成 `validateDraft` 与 `buildRequest`；绑定 target 保持 provider 字段名，source 统一 JSON Pointer。
4. 对旧 dotted source 在 legacy adapter 中一次性转换，禁止 runtime 继续散落路径解析。

## 任务 3：Registry active pointer、兼容性和原子安装

文件：`mobile/src/workflows/registry/repository.ts`、`service.ts`、`semver.ts`、测试。

1. 先补失败测试：active 优先于 source rank；builtin 首次 bootstrap 自动 setActive；远程/本地导入不覆盖 active，除非显式 activate；rollback 恢复 previous。
2. 增加 semver compare/range（精确版本、`>=`、`^`、`~`）并在安装前检查 `minAppVersion` 与 `requiredAdapterVersion`。
3. 增加 artifact kind 与 adapter capabilities 校验；错误码区分 schema/compatibility/hash/signature。
4. 远程 fetch 增加 HTTPS allowlist、状态码、超时、响应大小上限和 JSON 解析保护；先完整验证再 upsert/setActive，失败不得改变当前活动版本。
5. `removeUnreferenced` 保留 active 与 previous 指针引用，避免回滚链被 GC 破坏。

## 任务 4：固定 Git 订阅源与 commit-attestation

文件：`mobile/src/workflows/registry/gitSource.ts`、`trust.ts`、测试与文档。

1. 定义 `GitSubscriptionConfig`（固定 repository URL、allowedRef、registryId、trusted key fingerprint）和 `GitSourceClient` transport；不允许用户输入任意仓库安装。
2. 订阅清单使用签名 JSON，载荷绑定 repository/ref/commit/entries；实现 Ed25519 attestation 验证，检查 commit SHA、tree/content hash 与 package hash 一致。
3. 只通过固定 commit 的 raw HTTPS 地址取 package，拒绝 branch-floating 内容、重定向到非白名单域名及超过大小上限的响应。
4. 将验证结果传给 Registry service 的 staged install；记录 trust/source/commit 信息，提供可诊断错误，不执行远程代码。

## 任务 5：迁移 builtin H3 并建立本地 catalog bootstrap

文件：`mobile/src/workflows/definitions/autodl/minimax-h3-i2v-15s.json`、新增 package/catalog 模块及测试。

1. 将现有 H3 定义包装为 canonical WorkflowPackage，补齐 adapter version、compatibility、limits、capabilities 和 JSON Pointer bindings。
2. 启动时 upsert builtin 并 setActive；数据库已有记录时只在 hash 变化且新版本通过验证后替换。
3. 为后续多工作流注册提供 `WorkflowCatalog` 查询接口（list active、get active、activate、rollback），不在 UI 中写 workflow id。

## 任务 6：运行时与 CreateForm 改为 Registry 驱动

文件：`mobile/src/workflows/runtime/runtime.ts`、`mobile/src/workflows/renderer/WorkflowForm.tsx`、`mobile/src/create/CreateForm.tsx`、相关测试。

1. Runtime 接收 compiled plan/active record，使用 compiler 的 schema validation 和 request binding；提交 job 固化 workflow id/version/contentHash/adapterVersion。
2. CreateForm 通过 catalog 获取 active workflow，显示 metadata.title/description 和完整 uiSchema；保留素材选择作为 `image[]/audio[]` semantic renderer/override，不再 import H3 JSON。
3. active workflow 加载失败时显示可恢复错误并禁止提交；提交前再次校验 active hash，防止切换竞态。
4. 增加一个最小第二 builtin fixture 测试“同一 UI + 不同 adapter/request”可注册并渲染，证明扩展路径。

## 任务 7：可靠性、回归与文档

1. 为 registry/compiler/runtime 增加 hash cache、并发安装锁、幂等同步和失败后重试边界测试。
2. 跑 `npm run typecheck`、完整 Jest；若依赖缺失先按仓库约定安装，Android 构建仅在 Java 可用时执行。
3. 更新 README/roadmap 与架构文档：package contract、Git 发布格式、信任边界、升级/回滚流程、未来插件化 adapter 接口。
4. 完成后请求一次代码审查，确认未引入外部服务器依赖、未扩大 URL/代码执行面。

## 执行顺序

严格按任务 1→7；每个任务先新增失败测试，再实现，单任务通过后再进入下一任务。提交粒度按任务拆分，便于回滚和审查。
