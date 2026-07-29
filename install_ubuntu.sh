#!/bin/bash

# BedWars Ubuntu自动安装脚本
# 适用于Ubuntu 20.04/22.04

echo "=========================================="
echo "  BedWars - Ubuntu自动安装脚本"
echo "=========================================="
echo ""

# 检查是否以root用户运行
if [ "$EUID" -ne 0 ]; then
    echo "请以root用户运行此脚本!"
    echo "使用: sudo ./install_ubuntu.sh"
    exit 1
fi

# 检查系统版本
echo "检查系统版本..."
if [ -f /etc/os-release ]; then
    . /etc/os-release
    echo "系统: $NAME $VERSION_ID"
    
    if [[ "$ID" != "ubuntu" ]]; then
        echo "此脚本仅支持Ubuntu系统!"
        exit 1
    fi
else
    echo "无法检测系统版本!"
    exit 1
fi

echo ""

# 更新系统
echo "更新系统包..."
apt-get update -qq
apt-get upgrade -y -qq

if [ $? -ne 0 ]; then
    echo "系统更新失败!"
    exit 1
fi

echo "系统更新完成!"
echo ""

# 安装依赖
echo "安装依赖包..."
apt-get install -y -qq curl git build-essential

if [ $? -ne 0 ]; then
    echo "依赖安装失败!"
    exit 1
fi

echo "依赖安装完成!"
echo ""

# 安装Node.js 18
echo "安装Node.js 18..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - -qq
    apt-get install -y -qq nodejs
    
    if [ $? -ne 0 ]; then
        echo "Node.js安装失败!"
        exit 1
    fi
    
    echo "Node.js安装完成!"
    echo "Node.js版本: $(node --version)"
    echo "npm版本: $(npm --version)"
else
    echo "Node.js已安装: $(node --version)"
fi

echo ""

# 克隆或更新项目
echo "设置BedWars项目..."
PROJECT_DIR="/opt/bedwars"

if [ -d "$PROJECT_DIR" ]; then
    echo "项目目录已存在，正在更新..."
    cd "$PROJECT_DIR"
    git pull origin main
else
    echo "克隆项目..."
    git clone https://github.com/ItzSimpleDrexis/BEDWARS-HTML.git "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

if [ $? -ne 0 ]; then
    echo "项目设置失败!"
    exit 1
fi

echo "项目设置完成!"
echo ""

# 安装项目依赖
echo "安装项目依赖..."
npm install --production

if [ $? -ne 0 ]; then
    echo "项目依赖安装失败!"
    exit 1
fi

echo "项目依赖安装完成!"
echo ""

# 创建系统服务
echo "创建系统服务..."
SERVICE_FILE="/etc/systemd/system/bedwars.service"

cat > "$SERVICE_FILE" << EOF
[Unit]
Description=BedWars Game Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/node $PROJECT_DIR/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 重载systemd
echo "重载systemd..."
systemctl daemon-reload

if [ $? -ne 0 ]; then
    echo "systemd重载失败!"
    exit 1
fi

# 启用服务
echo "启用BedWars服务..."
systemctl enable bedwars.service

if [ $? -ne 0 ]; then
    echo "服务启用失败!"
    exit 1
fi

echo "服务启用完成!"
echo ""

# 启动服务
echo "启动BedWars服务..."
systemctl start bedwars.service

if [ $? -ne 0 ]; then
    echo "服务启动失败!"
    exit 1
fi

echo "服务启动完成!"
echo ""

# 检查服务状态
echo "检查服务状态..."
sleep 3
systemctl status bedwars.service --no-pager

echo ""

# 显示访问信息
echo "=========================================="
echo "  ✅ BedWars安装完成!"
echo "=========================================="
echo ""
echo "游戏地址: http://$(hostname -I | awk '{print $1}'):3000"
echo "或者: http://localhost:3000"
echo ""
echo "服务管理命令:"
echo "  启动服务: sudo systemctl start bedwars"
echo "  停止服务: sudo systemctl stop bedwars"
echo "  重启服务: sudo systemctl restart bedwars"
echo "  查看日志: sudo journalctl -u bedwars -f"
echo "  查看状态: sudo systemctl status bedwars"
echo ""
echo "项目目录: $PROJECT_DIR"
echo ""
echo "享受游戏! 🎮⚔️🛡️"
echo ""
