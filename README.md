# BedWars - 起床战争

一个基于Node.js和Socket.io的多玩家BedWars游戏，仿照我的世界起床战争模式。

## 🎮 游戏特性

- **1v1到4v4团队战** - 支持2-8名真实玩家，其余由AI控制
- **资源系统** - 铁锭、金锭、钻石、绿宝石随机生成
- **商店系统** - 可以购买武器、盔甲、方块和TNT
- **床保护机制** - 破坏敌方床可以阻止对方重生
- **AI队友** - 每个队伍有AI控制的队友
- **团队指令** - 按F键发送团队指令（全员保护床、全员出击、跟我走）
- **5秒重生** - 死亡后5秒自动重生

## 🚀 快速开始

### 前置要求

- Node.js 16+ 
- Ubuntu 20.04+ (或其他Linux发行版)
- Git

### 安装步骤

```bash
# 克隆仓库
cd /workspace/ItzSimpleDrexis__BEDWARS-HTML

# 安装依赖
npm install

# 启动服务器
npm start
```

或者使用开发模式（自动重启）：
```bash
npm run dev
```

### 访问游戏

打开浏览器，访问：
```
http://localhost:3000
```

## 🎯 游戏控制

### 键盘控制
- **WASD / 箭头键** - 移动
- **E** - 打开商店
- **F** - 团队指令菜单
- **R** - 立即重生（死亡后）
- **鼠标左键** - 攻击/收集资源/破坏床

### 团队指令 (F键)
- **🛡️ 全员保护床** - AI队友会守卫床
- **⚔️ 全员出击** - AI队友会主动攻击敌人
- **👣 跟我走** - AI队友会跟随你

## 🏆 游戏规则

1. **目标**：破坏敌方的床，阻止对方重生
2. **资源**：收集铁锭、金锭、钻石、绿宝石来购买装备
3. **商店**：在商店可以购买武器、盔甲、方块和TNT
4. **重生**：死亡后5秒自动重生（如果床存在）
5. **获胜**：最后一个保护床的队伍获胜

## 📦 项目结构

```
bedwars-game/
├── server.js          # 游戏服务器主逻辑
├── package.json       # Node.js配置
├── public/
│   ├── index.html     # 游戏页面
│   ├── styles.css     # 样式文件
│   └── game.js        # 客户端游戏逻辑
└── README.md          # 项目说明
```

## 🔧 配置选项

在 `server.js` 中可以修改游戏配置：

```javascript
const GAME_CONFIG = {
  maxPlayers: 8,           // 最大玩家数
  minPlayers: 2,           // 最小开始玩家数
  respawnTime: 5000,       // 重生时间（毫秒）
  gameDuration: 300000,    // 游戏时长（毫秒）
  mapSize: { width: 100, height: 100 },  // 地图大小
  teamColors: ['red', 'blue', 'green', 'yellow'],  // 队伍颜色
  resources: {
    iron: { spawnRate: 10000, value: 1 },    // 铁锭生成速率和价值
    gold: { spawnRate: 15000, value: 2 },   // 金锭
    diamond: { spawnRate: 30000, value: 3 }, // 钻石
    emerald: { spawnRate: 60000, value: 4 } // 绿宝石
  }
};
```

## 🤖 AI行为

AI玩家有以下行为模式：
- **守卫模式**：守卫床，攻击靠近的敌人
- **攻击模式**：主动寻找并攻击敌人
- **收集模式**：收集地图上的资源
- **跟随模式**：跟随队长（当收到跟我走指令时）
- **慌乱模式**：当床被破坏时，AI会慌乱并尝试攻击敌人

## 🌐 多玩家

游戏使用Socket.io实现实时多玩家同步。要在局域网或互联网上运行：

1. 修改 `server.js` 中的端口（如果需要）
2. 在服务器上运行 `npm start`
3. 其他玩家可以通过 `http://<服务器IP>:3000` 访问

## 📝 许可证

MIT License - 详见 LICENSE 文件

## 🙏 致谢

- 感谢Minecraft的BedWars模式启发
- 使用Socket.io实现实时通信
- 使用Express.js构建Web服务器

---

**享受游戏！** 🎮⚔️🛡️
