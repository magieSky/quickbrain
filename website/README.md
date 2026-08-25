# 速脑 官网

产品宣传站（中文为主；「QuickBrain」保留为英文副品牌。单页 static site，无构建工具，部署即文件。

## 文件结构

```
website/
  index.html          单页
  styles.css          样式（深色玻璃拟态）
  app.js              滚动 reveal + 平滑锚点跳转
  assets/
    logo.svg          主 logo（大脑 + 闪电）
    favicon.svg       浏览器 tab 图标
    og-image.svg      OG 社交分享预览（1200x630）
```

## 本地预览

```
python -m http.server 8000 --bind 127.0.0.1 --directory website
```

然后浏览器访问 `http://127.0.0.1:8000/`。

## 部署（nginx）

1. 上传 `website/` 内容到 `/var/www/quickbrain-website/`
2. 写 nginx vhost（参考 `../deploy/note.bjhzsk.cn.conf`）：
   ```nginx
   server {
     listen 80;
     server_name quickbrain.bjhzsk.cn;

     location /.well-known/acme-challenge/ {
       root /var/www/certbot;
     }

     location / {
       return 301 https://$host$request_uri;
     }
   }

   server {
     listen 443 ssl http2;
     server_name quickbrain.bjhzsk.cn;

     ssl_certificate     /etc/letsencrypt/live/quickbrain.bjhzsk.cn/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/quickbrain.bjhzsk.cn/privkey.pem;
     ssl_trusted_certificate /etc/letsencrypt/live/quickbrain.bjhzsk.cn/chain.pem;

     # (与 note.bjhzsk.cn.conf 相同的 ssl_* 配置)

     root /var/www/quickbrain-website;
     index index.html;

     location / {
       try_files $uri $uri/ /index.html;
     }

     # 缓存静态资源
     location ~* \.(svg|css|js|woff2?)$ {
       expires 7d;
       add_header Cache-Control "public, max-age=604800, immutable";
     }
   }
   ```
3. 申请证书：
   ```
   certbot certonly --webroot -w /var/www/certbot -d quickbrain.bjhzsk.cn --email you@example.com --agree-tos --no-eff-email
   ```
4. `nginx -t && nginx -s reload`

## 待办

- [ ] 下载按钮链接到实际 release（GitHub / 网盘）
- [ ] macOS / Linux 平台按钮
- [ ] 真实截图替换 mock
- [ ] 多语言（中 / 英）