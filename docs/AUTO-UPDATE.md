# 速脑 桌面端自动更新部署

本文档说明 GitHub Actions 如何把构建产物自动同步到 `note.bjhzsk.cn/download/`，以及用户端 `electron-updater` 如何发现并安装新版本。

## 整体流程

```
push tag v*  ──>  build-desktop.yml           (构建三平台 + 发 GitHub Release)
                   │
                   └─ workflow_run success ──> deploy-downloads.yml
                                                 │
                                                 ├─ 下载 artifacts
                                                 ├─ SCP 到服务器 /var/www/quickbrain-downloads/
                                                 ├─ 清理老版本（每平台每扩展名留最新 5 个）
                                                 └─ smoke test https://note.bjhzsk.cn/download/<plat>/latest*.yml

用户启动客户端 ──> electron-updater 拉取 latest*.yml
                   │
                   ├─ 有新版本 → 弹窗"是否现在下载并安装"
                   ├─ 下载完成 → 弹窗"立即重启"
                   └─ 退出安装
```

## 一次性配置

### 1. 服务器（117.72.162.39:22277，root 免密）

```bash
# 创建下载根目录
sudo mkdir -p /var/www/quickbrain-downloads/{windows,mac,linux}
sudo chown root:root /var/www/quickbrain-downloads

# 把公钥加到 root authorized_keys（GH Actions 用）
# 在本地生成：
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/quickbrain_deploy
# 把 ~/.ssh/quickbrain_deploy.pub 追加到服务器的 ~/.ssh/authorized_keys
# 私钥 ~/.ssh/quickbrain_deploy（完整内容，含 BEGIN/END 行）填到 GitHub Secret

# 拉取新 nginx 配置 + reload
sudo cp note.bjhzsk.cn.conf /etc/nginx/conf.d/note.bjhzsk.cn.conf
sudo nginx -t && sudo systemctl reload nginx
```

> `/download/` 路由必须放在 nginx 默认 `/`（try_files）之前，否则会被兜底路由拦截。

### 2. GitHub 仓库 Secrets

进入 https://github.com/<owner>/quickbrain/settings/secrets/actions 添加：

| Secret          | 值                       | 说明                                |
|-----------------|--------------------------|------------------------------------|
| `DEPLOY_HOST`   | `117.72.162.39`          | 服务器 IP / 域名                    |
| `DEPLOY_PORT`   | `22277`                  | SSH 端口（不填默认 22）             |
| `DEPLOY_USER`   | `root`                   | SSH 用户（不填默认 root）           |
| `DEPLOY_SSH_KEY`| `<私钥完整内容>`         | 用于 SCP/SSH，**整段**含 BEGIN/END |

### 3. 触发方式

**自动**：push tag `v*` 触发 `build-desktop.yml`，构建成功后自动触发 `deploy-downloads.yml`。

```bash
git tag v1.0.1
git push origin v1.0.1
```

**手动**：在 GitHub Actions 页面选 `deploy-downloads` → `Run workflow`（适合回填历史版本或调试）。

## 客户端侧行为

`client/src/main/updater.js` 在 app 启动 6 秒后自动调用 `checkForUpdates`：

- **dev / `QB_SKIP_UPDATER=1`**：跳过检查
- **有新版**：弹窗让用户选「稍后 / 下载并安装」
- **下载完成**：再弹窗「稍后 / 立即重启」
- **重启**：调用 `quitAndInstall(false, true)`

`package.json` 的 `build.publish` 已配好三平台 download URL：

```json
"win":   { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/download/windows" } },
"mac":   { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/download/mac" } },
"linux": { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/download/linux" } }
```

## 验证清单

```bash
# 1. workflow YAML 语法
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-downloads.yml','utf8'))"

# 2. nginx 配置语法
ssh root@117.72.162.39 -p 22277 "nginx -t"

# 3. latest.yml 可访问
curl -fsSL https://note.bjhzsk.cn/download/windows/latest.yml | head
curl -fsSL https://note.bjhzsk.cn/download/mac/latest-mac.yml | head
curl -fsSL https://note.bjhzsk.cn/download/linux/latest-linux.yml | head

# 4. 手动跑一次 deploy
gh workflow run deploy-downloads.yml

# 5. 客户端更新流：安装一个旧版本，启动后看 ~/quickbrain-debug.log 的 [updater] 日志
```

## 注意事项

- **macOS 未签名**：`CSC_IDENTITY_AUTO_DISCOVERY=false`，dmg 没公证。用户首次需在「系统设置 → 隐私与安全性」点「仍要打开」。
- **清理策略**：每个平台每个扩展名（`exe`/`dmg`/`AppImage`/`deb`/`blockmap` 等）只保留最新 5 个旧版本；`latest*.yml` / `latest-mac.yml` / `latest-linux.yml` 永远保留。
- **失败重试**：手动 `Run workflow` 即可触发重新部署，不会重复发 GitHub Release。
- **GitHub Release**：仍由 `build-desktop.yml` 在 arm64 job 里自动创建（用户也能从 GitHub 下载）。