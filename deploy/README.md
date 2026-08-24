# QuickBrain Server Deploy

Production deployment of QuickBrain server (Fastify + Postgres + Redis + BullMQ).

## Layout

- `Dockerfile`: multi-stage build for the Node server (context is repo root)
- `docker-compose.yml`: server + postgres + redis
- `.env.example`: required env vars

## One-time setup on server

```bash
# 1. create deploy dir
sudo mkdir -p /opt/quickbrain
sudo chown $USER:$USER /opt/quickbrain

# 2. copy this deploy/ folder to /opt/quickbrain
#    plus the repo (shared/ + server/ are required at the build context root)

# 3. write env
cp deploy/.env.example deploy/.env
# generate secrets:
node -e "console.log('MASTER_KEY=' + require('crypto').randomBytes(32).toString('hex'))" >> deploy/.env
node -e "console.log('OWNER_TOKEN=' + require('crypto').randomBytes(24).toString('base64url'))" >> deploy/.env
# fill in QB_PORT / QB_MODE if different

# 4. bring up
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build

# 5. verify
docker compose -f deploy/docker-compose.yml logs -f server
curl http://127.0.0.1:7421/health
```

## nginx vhost (see /etc/nginx/conf.d/note.bjhzsk.cn.conf)

```nginx
server {
    listen 80;
    server_name note.bjhzsk.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name note.bjhzsk.cn;

    ssl_certificate     /etc/letsencrypt/live/note.bjhzsk.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/note.bjhzsk.cn/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/note.bjhzsk.cn/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    client_max_body_size 50m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    location / {
        proxy_pass http://127.0.0.1:7421;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_connect_timeout 300s;
        proxy_send_timeout    300s;
        proxy_read_timeout    300s;
    }
}
```

## SSL cert

```bash
certbot certonly --webroot -w /var/www/certbot -d note.bjhzsk.cn --email you@example.com --agree-tos --no-eff-email
```

Auto-renewal is already configured via `certbot-renew.timer` (systemd).

## Manual nginx reload

```bash
nginx -t && systemctl reload nginx
```
