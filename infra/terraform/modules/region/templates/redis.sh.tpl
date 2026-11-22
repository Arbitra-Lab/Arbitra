#!/bin/bash
set -euo pipefail

dnf install -y redis || yum install -y redis

cat > /etc/redis/redis.conf <<'EOF'
bind 0.0.0.0
protected-mode no
port 6379
appendonly yes
EOF

%{ if master_ip != "" }
cat >> /etc/redis/redis.conf <<EOF
replicaof ${master_ip} 6379
EOF
%{ endif }

systemctl enable --now redis
