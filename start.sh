#!/bin/bash

echo "==================================="
echo "  BedWars - 起床战争游戏服务器"
echo "==================================="
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: Node.js 未安装!"
    echo "请先安装Node.js 16+"
    echo "Ubuntu安装命令: curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -"
    echo "然后运行: sudo apt-get install -y nodejs"
    exit 1
fi

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "错误: npm 未安装!"
    exit 1
fi

# 检查是否在正确的目录
echo "当前目录: $(pwd)"
echo ""

# 安装依赖
echo "正在安装依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "依赖安装失败!"
    exit 1
fi

echo "依赖安装完成!"
echo ""

# 启动服务器
echo "启动BedWars服务器..."
echo "服务器地址: http://localhost:3000"
echo "按 Ctrl+C 停止服务器"
echo ""

npm start
