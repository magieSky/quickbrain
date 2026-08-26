# 速脑 桌面端自动更新部署

本文档说明 GitHub Actions 如何把构建产物自动同步到 `note.bjhzsk.cn/downloads/desktop/`，以及用户端 `electron-updater` 如何发现并安装新版本。

## 整体流程

```
push tag v*  ──>  build-desktop.yml           (构建三平台 + 发 GitHub Release)
                   │
                   └─ workflow_run success ──> deploy-downloads.yml
                                                 │
                                                 ├─ 下载 artifacts
                                                 ├─ SCP 到服务器 /var/www/quickbrain-website/downloads/desktop/
                                                 ├─ 清理老版本（每扩展名留最新 5 个）
                                                 └─ smoke test https://note.bjhzsk.cn/downloads/desktop/latest*.yml

用户启动客户端 ──> electron-updater 拉取 latest*.yml
                   │
                   ├─ 有新版本 → 弹窗"是否现在下载并安装"
                   ├─ 下载完成 → 弹窗"立即重启"
                   └─ 退出安装
```

## 服务器目录结构（扁平，所有平台混在一起）

`/var/www/quickbrain-website/downloads/desktop/`
```
QuickBrain-Setup-<ver>.exe            (Windows 安装包)
QuickBrain-Setup-<ver>.exe.blockmap
latest.yml                            (Win 给 electron-updater 读)
QuickBrain-<ver>-arm64.dmg            (macOS Apple Silicon)
QuickBrain-<ver>-arm64.dmg.blockmap
QuickBrain-<ver>-x64.dmg              (macOS Intel)
QuickBrain-<ver>-x64.dmg.blockmap
latest-mac.yml                        (mac 给 electron-updater 读)
QuickBrain-<ver>.AppImage             (Linux AppImage)
QuickBrain-<ver>.deb                  (Linux deb)
latest-linux.yml                      (Linux 给 electron-updater 读)
```

nginx 已经在 conf.d 里把 `/var/www/quickbrain-website` 当静态目录 serve（`location / { try_files ... }`），**不需要再改 nginx**。

## 一次性配置

### 1. 服务器（117.72.162.39:22277，root 免密）

```bash
# 下载目录已经存在 (/var/www/quickbrain-website/downloads/desktop/)，
# 不用创建。但如果新机器则需要：
sudo mkdir -p /var/www/quickbrain-website/downloads/desktop
sudo chown root:root /var/www/quickbrain-website/downloads/desktop
sudo chmod 755 /var/www/quickbrain-website/downloads/desktop

# 把 deploy 公钥加到服务器的 ~/.ssh/authorized_keys
# （在本地生成并填到 GitHub Secret 的私钥成对的那个 .pub）

# nginx conf 不需要改动；如果改了 deploy/note.bjhzsk.cn.conf 才需要 reload：
sudo nginx -t && sudo systemctl reload nginx
```

### 2. GitHub 仓库 Secrets

进入 https://github.com/magieSky/quickbrain/settings/secrets/actions 添加：

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

`package.json` 的 `build.publish` 已统一配为同一个 URL：

```json
"win":   { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/downloads/desktop" } },
"mac":   { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/downloads/desktop" } },
"linux": { "publish": { "provider": "generic", "url": "https://note.bjhzsk.cn/downloads/desktop" } }
```

electron-updater 会按平台自动拼出 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`。

## 验证清单

```bash
# 1. workflow YAML 语法
node -e "require('js-yaml').load(require('fs').readFileSync('.github/workflows/deploy-downloads.yml','utf8'))"

# 2. nginx 配置语法（不需要 reload）
ssh root@117.72.162.39 -p 22277 "nginx -t"

# 3. latest.yml 可访问
curl -fsSL https://note.bjhzsk.cn/downloads/desktop/latest.yml | head
curl -fsSL https://note.bjhzsk.cn/downloads/desktop/latest-mac.yml | head
curl -fsSL https://note.bjhzsk.cn/downloads/desktop/latest-linux.yml | head

# 4. 手动跑一次 deploy
gh workflow run deploy-downloads.yml

# 5. 客户端更新流：安装一个旧版本，启动后看 ~/quickbrain-debug.log 的 [updater] 日志
```

## 注意事项

- **macOS 未签名**：`CSC_IDENTITY_AUTO_DISCOVERY=false`，dmg 没公证。用户首次需在「系统设置 → 隐私与安全性」点「仍要打开」。
- **清理策略**：每个扩展名（`exe`/`dmg`/`AppImage`/`deb`/`blockmap` 等）只保留最新 5 个旧版本；`latest.yml` / `latest-mac.yml` / `latest-linux.yml` 永远保留。
- **失败重试**：手动 `Run workflow` 即可触发重新部署，不会重复发 GitHub Release。
- **GitHub Release**：仍由 `build-desktop.yml` 在 arm64 job 里自动创建（用户也能从 GitHub 下载）。
- **为什么 desktop/ 目录？** 官网首页 index.html 硬编码了 `/downloads/desktop/` 这条路径；extension 包走 `/downloads/quickbrain-extension-*.zip`，所以桌面端统一放 `desktop/` 子目录。