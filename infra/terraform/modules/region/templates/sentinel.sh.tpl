#!/bin/bash
set -euo pipefail

dnf install -y redis || yum install -y redis

cat > /etc/redis/sentinel.conf <<EOF
port 26379
bind 0.0.0.0
protected-mode no
sentinel monitor ${master_name} ${master_ip} 6379 2
sentinel down-after-milliseconds ${master_name} 5000
sentinel failover-timeout ${master_name} 30000
sentinel parallel-syncs ${master_name} 1
%{ if sentinel_pass != "" }
sentinel auth-pass ${master_name} ${sentinel_pass}
%{ endif }
EOF

systemctl enable --now redis-sentinel || redis-server /etc/redis/sentinel.conf --sentinel
