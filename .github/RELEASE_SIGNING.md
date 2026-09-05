# GitHub Actions Release 签名配置

正式 APK 只允许由 GitHub Actions 的 `release` Environment 构建。开发机不需要保存正式 release keystore。

## 一次性配置

在仓库 Settings → Environments 中创建环境 `release`，再在该环境中添加以下四个 Secrets：

| Secret | 内容 |
| --- | --- |
| `AUTODL_UPLOAD_KEYSTORE_BASE64` | `release-upload.jks` 的 Base64 内容 |
| `AUTODL_UPLOAD_STORE_PASSWORD` | keystore 密码 |
| `AUTODL_UPLOAD_KEY_ALIAS` | `autodl-h3-upload` |
| `AUTODL_UPLOAD_KEY_PASSWORD` | key 条目密码 |

PowerShell 示例（不会把 keystore 写入仓库）：

```powershell
$keystore = Join-Path $env:USERPROFILE ".autodl-h3\release-upload.jks"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)) |
  gh secret set AUTODL_UPLOAD_KEYSTORE_BASE64 --env release --repo czh869452912/autodl_minimax_h3
```

密码应通过 GitHub Web UI 或本地安全输入设置，不要提交到 Git，也不要写入工作流日志。

## 触发规则

只有推送到 `main` 提交历史上的 `v*` tag 才会触发工作流。工作流会再次验证：

- tag 指向 `origin/main` 的祖先提交；
- tag 版本与 `mobile/app.json`、`mobile/package.json`、Gradle 版本一致；
- APK 版本与 tag 一致、包含四种 ABI，并通过 `apksigner verify`；
- 构建成功后使用仓库 `GITHUB_TOKEN` 创建同名 Release 并上传 universal APK。

Release Notes 会按提交信息自动整理为“修复”和“改进”两部分，因此提交应继续使用 `fix:`、`feat:`、`refactor:`、`perf:` 等 Conventional Commit 前缀。

不要在普通 PR、fork PR 或非 `main` 分支 tag 上暴露 `release` Environment Secrets。

## 构建资源与失败恢复

CI 的完整 universal 构建使用 6 GiB Java heap、1 GiB Metaspace、最多两个 Gradle worker，并关闭项目并行构建。Kotlin daemon 单独限制为 2 GiB heap / 512 MiB Metaspace，避免继承扩大的 Gradle 预算。JVM 遇到 OOM 立即退出；构建步骤限时 45 分钟，整个 job 限时 60 分钟。开发机的默认 Gradle 内存设置不受影响。

若 tag 构建因 CI 配置失败，先通过 PR 修正 `main` 的工作流，再从 `main` 手动运行 Android Release，输入原来的 `release_tag`（例如 `v1.4.11`）。工作流检出原 tag，验证 tag 存在、指向 `main` 历史、源码 HEAD 和版本一致后才读取签名材料；不移动或覆盖既有 tag。单纯 Re-run 原运行不会使用新工作流配置。

命令示例：`gh workflow run release.yml --ref main -f release_tag=v1.4.11`。该恢复入口用于尚未成功发布的版本，已有 Release/资产不会自动删除或替换。
