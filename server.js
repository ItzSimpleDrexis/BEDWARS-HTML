const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 配置Express静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

// 根路由返回index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 游戏配置
const GAME_CONFIG = {
  mapSize: { width: 800, height: 600 },
  teamSizes: [1, 2, 3, 4], // 支持1v1到4v4
  defaultTeamSize: 2,
  respawnTime: 5000, // 5秒重生
  gameDuration: 300000, // 5分钟游戏时长
  resourceSpawnInterval: 10000, // 资源生成间隔
  aiUpdateInterval: 100 // AI更新间隔
};

// 资源类型
const RESOURCE_TYPES = {
  IRON: { name: '铁锭', color: '#A8A8A8', value: 1, spawnRate: 0.6 },
  GOLD: { name: '金锭', color: '#FFD700', value: 3, spawnRate: 0.3 },
  DIAMOND: { name: '钻石', color: '#00BFFF', value: 6, spawnRate: 0.1 },
  EMERALD: { name: '绿宝石', color: '#50C878', value: 10, spawnRate: 0.05 }
};

// 商店物品
const SHOP_ITEMS = {
  weapons: [
    { id: 'wood_sword', name: '木剑', cost: 10, type: 'weapon', damage: 4, tier: 1 },
    { id: 'stone_sword', name: '石剑', cost: 20, type: 'weapon', damage: 5, tier: 2 },
    { id: 'iron_sword', name: '铁剑', cost: 40, type: 'weapon', damage: 7, tier: 3 },
    { id: 'diamond_sword', name: '钻石剑', cost: 80, type: 'weapon', damage: 9, tier: 4 }
  ],
  armor: [
    { id: 'leather_armor', name: '皮甲', cost: 15, type: 'armor', defense: 2, tier: 1 },
    { id: 'chainmail_armor', name: '锁子甲', cost: 30, type: 'armor', defense: 4, tier: 2 },
    { id: 'iron_armor', name: '铁甲', cost: 60, type: 'armor', defense: 6, tier: 3 },
    { id: 'diamond_armor', name: '钻石甲', cost: 120, type: 'armor', defense: 8, tier: 4 }
  ],
  tools: [
    { id: 'pickaxe', name: '镐子', cost: 10, type: 'tool', speed: 1.5 },
    { id: 'axe', name: '斧头', cost: 15, type: 'tool', speed: 1.2 },
    { id: 'shears', name: '剪刀', cost: 20, type: 'tool', speed: 2.0 }
  ],
  blocks: [
    { id: 'wool', name: '羊毛', cost: 5, type: 'block', health: 30 },
    { id: 'wood', name: '木头', cost: 10, type: 'block', health: 50 },
    { id: 'stone', name: '石头', cost: 20, type: 'block', health: 80 },
    { id: 'obsidian', name: '黑曜石', cost: 50, type: 'block', health: 200 }
  ],
  special: [
    { id: 'bed', name: '床', cost: 0, type: 'special', canBuy: false },
    { id: 'tnt', name: 'TNT', cost: 60, type: 'special', damage: 50, radius: 100 },
    { id: 'fireball', name: '火球', cost: 80, type: 'special', damage: 40, radius: 80 }
  ]
};

// 团队指令类型
const TEAM_COMMANDS = {
  DEFEND_BED: '全员保护床',
  ATTACK: '全员出击',
  FOLLOW_ME: '跟我走'
};

class Game {
  constructor() {
    this.id = uuidv4();
    this.players = new Map(); // socketId -> Player
    this.teams = new Map(); // teamId -> Team
    this.resources = [];
    this.projectiles = [];
    this.beds = new Map(); // teamId -> Bed
    this.gameState = 'waiting'; // waiting, playing, ended
    this.startTime = null;
    this.resourceSpawnTimer = null;
    this.aiUpdateTimer = null;
    this.winnerTeam = null;
  }

  addPlayer(socketId, playerName, teamId = null) {
    const player = new Player(socketId, playerName);
    
    // 如果没有指定队伍，分配到人数最少的队伍
    if (!teamId) {
      teamId = this.findLeastPopulatedTeam();
    }
    
    player.teamId = teamId;
    
    // 如果队伍不存在，创建新队伍
    if (!this.teams.has(teamId)) {
      const teamColor = this.getTeamColor(teamId);
      this.teams.set(teamId, new Team(teamId, teamColor));
      
      // 为队伍创建床
      const bedPosition = this.getTeamSpawnPosition(teamId);
      const bed = new Bed(teamId, bedPosition.x, bedPosition.y);
      this.beds.set(teamId, bed);
    }
    
    // 添加玩家到队伍
    this.teams.get(teamId).addPlayer(player);
    this.players.set(socketId, player);
    
    // 设置玩家初始位置
    const spawnPos = this.getTeamSpawnPosition(teamId);
    player.x = spawnPos.x;
    player.y = spawnPos.y;
    
    return player;
  }

  findLeastPopulatedTeam() {
    let minPlayers = Infinity;
    let selectedTeam = null;
    
    for (const [teamId, team] of this.teams) {
      if (team.players.size < minPlayers) {
        minPlayers = team.players.size;
        selectedTeam = teamId;
      }
    }
    
    // 如果没有队伍，创建第一个队伍
    if (selectedTeam === null) {
      return 'team_1';
    }
    
    return selectedTeam;
  }

  getTeamColor(teamId) {
    const colors = ['#FF0000', '#0000FF', '#00FF00', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'];
    const index = Object.keys(this.teams).length % colors.length;
    return colors[index];
  }

  getTeamSpawnPosition(teamId) {
    const teamIndex = parseInt(teamId.split('_')[1]) - 1 || 0;
    const positions = [
      { x: 100, y: 100 },   // Team 1
      { x: 700, y: 100 },   // Team 2
      { x: 100, y: 500 },   // Team 3
      { x: 700, y: 500 },   // Team 4
      { x: 400, y: 100 },   // Team 5
      { x: 400, y: 500 },   // Team 6
      { x: 100, y: 300 },   // Team 7
      { x: 700, y: 300 }    // Team 8
    ];
    
    return positions[teamIndex % positions.length];
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return;
    
    // 从队伍中移除玩家
    const team = this.teams.get(player.teamId);
    if (team) {
      team.removePlayer(player);
      
      // 如果队伍没有玩家了，移除队伍
      if (team.players.size === 0) {
        this.teams.delete(player.teamId);
        this.beds.delete(player.teamId);
      }
    }
    
    this.players.delete(socketId);
    
    // 如果游戏中没有玩家了，重置游戏
    if (this.players.size === 0) {
      this.resetGame();
    }
  }

  startGame() {
    if (this.gameState !== 'waiting') return;
    if (this.players.size < 2) return; // 至少需要2个玩家
    
    this.gameState = 'playing';
    this.startTime = Date.now();
    
    // 启动资源生成定时器
    this.resourceSpawnTimer = setInterval(() => {
      this.spawnResources();
    }, GAME_CONFIG.resourceSpawnInterval);
    
    // 启动AI更新定时器
    this.aiUpdateTimer = setInterval(() => {
      this.updateAI();
    }, GAME_CONFIG.aiUpdateInterval);
    
    // 初始化游戏状态
    this.initializeGame();
  }

  initializeGame() {
    // 为每个队伍生成初始资源
    for (const [teamId, team] of this.teams) {
      // 在队伍基地附近生成一些资源
      const bed = this.beds.get(teamId);
      if (bed) {
        for (let i = 0; i < 3; i++) {
          const resourceType = this.getRandomResourceType();
          const offsetX = (Math.random() - 0.5) * 100;
          const offsetY = (Math.random() - 0.5) * 100;
          const resource = new Resource(
            resourceType,
            bed.x + offsetX,
            bed.y + offsetY
          );
          this.resources.push(resource);
        }
      }
    }
  }

  getRandomResourceType() {
    const types = Object.keys(RESOURCE_TYPES);
    const weights = types.map(type => RESOURCE_TYPES[type].spawnRate);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    let random = Math.random() * totalWeight;
    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random < 0) {
        return types[i];
      }
    }
    return types[0];
  }

  spawnResources() {
    // 在地图上随机位置生成资源
    const numResources = Math.floor(Math.random() * 3) + 1; // 1-3个资源
    
    for (let i = 0; i < numResources; i++) {
      const resourceType = this.getRandomResourceType();
      const x = Math.random() * (GAME_CONFIG.mapSize.width - 40) + 20;
      const y = Math.random() * (GAME_CONFIG.mapSize.height - 40) + 20;
      
      // 检查是否在床附近生成
      let tooCloseToBed = false;
      for (const bed of this.beds.values()) {
        const distance = Math.sqrt(Math.pow(x - bed.x, 2) + Math.pow(y - bed.y, 2));
        if (distance < 100) {
          tooCloseToBed = true;
          break;
        }
      }
      
      if (!tooCloseToBed) {
        const resource = new Resource(resourceType, x, y);
        this.resources.push(resource);
      }
    }
  }

  updateAI() {
    // 更新所有AI玩家
    for (const player of this.players.values()) {
      if (player.isAI) {
        this.updateAIPlayer(player);
      }
    }
  }

  updateAIPlayer(aiPlayer) {
    const team = this.teams.get(aiPlayer.teamId);
    if (!team) return;

    // AI决策逻辑
    const bed = this.beds.get(aiPlayer.teamId);
    
    // 如果床被破坏，AI会尝试攻击敌人
    if (bed && bed.health <= 0) {
      // 寻找最近的敌人
      const nearestEnemy = this.findNearestEnemy(aiPlayer);
      if (nearestEnemy) {
        this.moveTowards(aiPlayer, nearestEnemy.x, nearestEnemy.y);
        
        // 在攻击范围内则攻击
        const distance = this.getDistance(aiPlayer, nearestEnemy);
        if (distance < 50) {
          this.attackPlayer(aiPlayer, nearestEnemy);
        }
      }
    } else {
      // 正常行为：收集资源或保护床
      const nearestResource = this.findNearestResource(aiPlayer);
      const nearestEnemy = this.findNearestEnemy(aiPlayer);
      
      // 如果有资源附近，先收集资源
      if (nearestResource && (!nearestEnemy || 
          this.getDistance(aiPlayer, nearestResource) < this.getDistance(aiPlayer, nearestEnemy))) {
        this.moveTowards(aiPlayer, nearestResource.x, nearestResource.y);
        
        // 如果足够近，收集资源
        const distance = this.getDistance(aiPlayer, nearestResource);
        if (distance < 30) {
          this.collectResource(aiPlayer, nearestResource);
        }
      } 
      // 如果有敌人附近，攻击敌人
      else if (nearestEnemy) {
        const distance = this.getDistance(aiPlayer, nearestEnemy);
        
        // 如果敌人在攻击范围内
        if (distance < 50) {
          this.attackPlayer(aiPlayer, nearestEnemy);
        } else {
          // 移动到敌人附近
          this.moveTowards(aiPlayer, nearestEnemy.x, nearestEnemy.y);
        }
      }
      // 否则保护床
      else if (bed) {
        this.moveTowards(aiPlayer, bed.x, bed.y);
      }
    }
    
    // 随机购买物品
    if (Math.random() < 0.01) { // 1%概率购买物品
      this.aiBuyItem(aiPlayer);
    }
  }

  findNearestEnemy(player) {
    let nearestEnemy = null;
    let minDistance = Infinity;
    
    for (const otherPlayer of this.players.values()) {
      if (otherPlayer.teamId !== player.teamId && otherPlayer.health > 0) {
        const distance = this.getDistance(player, otherPlayer);
        if (distance < minDistance) {
          minDistance = distance;
          nearestEnemy = otherPlayer;
        }
      }
    }
    
    return nearestEnemy;
  }

  findNearestResource(player) {
    let nearestResource = null;
    let minDistance = Infinity;
    
    for (const resource of this.resources) {
      const distance = this.getDistance(player, resource);
      if (distance < minDistance) {
        minDistance = distance;
        nearestResource = resource;
      }
    }
    
    return nearestResource;
  }

  getDistance(obj1, obj2) {
    return Math.sqrt(Math.pow(obj1.x - obj2.x, 2) + Math.pow(obj1.y - obj2.y, 2));
  }

  moveTowards(player, targetX, targetY) {
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      const speed = player.speed || 2;
      player.x += (dx / distance) * speed * 0.1;
      player.y += (dy / distance) * speed * 0.1;
      
      // 更新朝向
      player.direction = Math.atan2(dy, dx);
    }
  }

  attackPlayer(attacker, target) {
    if (attacker.attackCooldown && Date.now() - attacker.attackCooldown < 500) {
      return; // 攻击冷却
    }
    
    const damage = attacker.weapon ? attacker.weapon.damage : 3;
    target.health -= damage;
    
    attacker.attackCooldown = Date.now();
    
    // 检查目标是否死亡
    if (target.health <= 0) {
      this.playerDied(target, attacker);
    }
  }

  collectResource(player, resource) {
    const resourceType = RESOURCE_TYPES[resource.type];
    if (resourceType) {
      player.resources[resourceType.name] = (player.resources[resourceType.name] || 0) + resourceType.value;
      
      // 移除资源
      const index = this.resources.indexOf(resource);
      if (index > -1) {
        this.resources.splice(index, 1);
      }
    }
  }

  playerDied(player, killer) {
    player.health = 0;
    player.isDead = true;
    
    // 重生定时器
    setTimeout(() => {
      this.respawnPlayer(player);
    }, GAME_CONFIG.respawnTime);
    
    // 给击杀者奖励
    if (killer && killer !== player) {
      killer.kills = (killer.kills || 0) + 1;
      
      // 从击杀者的资源中获取一部分
      for (const resourceName in player.resources) {
        const amount = Math.floor(player.resources[resourceName] * 0.3);
        if (amount > 0) {
          killer.resources[resourceName] = (killer.resources[resourceName] || 0) + amount;
          player.resources[resourceName] -= amount;
        }
      }
    }
    
    // 检查游戏结束条件
    this.checkGameEnd();
  }

  respawnPlayer(player) {
    player.health = 100;
    player.isDead = false;
    
    // 重置位置到队伍重生点
    const team = this.teams.get(player.teamId);
    if (team) {
      const bed = this.beds.get(player.teamId);
      if (bed && bed.health > 0) {
        player.x = bed.x + (Math.random() - 0.5) * 50;
        player.y = bed.y + (Math.random() - 0.5) * 50;
      } else {
        // 如果床被破坏，重生在随机位置
        player.x = Math.random() * (GAME_CONFIG.mapSize.width - 40) + 20;
        player.y = Math.random() * (GAME_CONFIG.mapSize.height - 40) + 20;
      }
    }
  }

  checkGameEnd() {
    const aliveTeams = new Set();
    
    for (const player of this.players.values()) {
      if (player.health > 0) {
        aliveTeams.add(player.teamId);
      }
    }
    
    // 如果只剩下一个队伍有玩家存活，游戏结束
    if (aliveTeams.size <= 1) {
      this.endGame(Array.from(aliveTeams)[0]);
    }
  }

  endGame(winnerTeamId) {
    this.gameState = 'ended';
    this.winnerTeam = winnerTeamId;
    
    // 清除定时器
    if (this.resourceSpawnTimer) {
      clearInterval(this.resourceSpawnTimer);
    }
    if (this.aiUpdateTimer) {
      clearInterval(this.aiUpdateTimer);
    }
    
    // 30秒后重置游戏
    setTimeout(() => {
      this.resetGame();
    }, 30000);
  }

  resetGame() {
    this.players.clear();
    this.teams.clear();
    this.resources = [];
    this.projectiles = [];
    this.beds.clear();
    this.gameState = 'waiting';
    this.startTime = null;
    this.winnerTeam = null;
    
    if (this.resourceSpawnTimer) {
      clearInterval(this.resourceSpawnTimer);
    }
    if (this.aiUpdateTimer) {
      clearInterval(this.aiUpdateTimer);
    }
  }

  aiBuyItem(aiPlayer) {
    // AI购买物品的简单逻辑
    const team = this.teams.get(aiPlayer.teamId);
    if (!team) return;
    
    const totalResources = Object.values(aiPlayer.resources).reduce((sum, amount) => sum + amount, 0);
    
    // 根据资源数量决定购买什么
    if (totalResources >= 80) {
      // 购买钻石剑
      this.buyItem(aiPlayer, 'diamond_sword');
    } else if (totalResources >= 40) {
      // 购买铁剑
      this.buyItem(aiPlayer, 'iron_sword');
    } else if (totalResources >= 20) {
      // 购买石剑
      this.buyItem(aiPlayer, 'stone_sword');
    } else if (totalResources >= 10) {
      // 购买木剑
      this.buyItem(aiPlayer, 'wood_sword');
    }
  }

  buyItem(player, itemId) {
    const item = this.getShopItem(itemId);
    if (!item) return false;
    
    // 检查是否能购买
    if (player.resources['铁锭'] < (item.cost || 0)) {
      return false;
    }
    
    // 扣除资源
    player.resources['铁锭'] -= (item.cost || 0);
    
    // 添加物品到玩家背包
    if (!player.inventory) {
      player.inventory = [];
    }
    
    player.inventory.push({
      id: item.id,
      name: item.name,
      type: item.type,
      ...item
    });
    
    // 如果是武器，装备它
    if (item.type === 'weapon') {
      player.weapon = item;
    }
    
    return true;
  }

  getShopItem(itemId) {
    for (const category of Object.values(SHOP_ITEMS)) {
      const item = category.find(item => item.id === itemId);
      if (item) return item;
    }
    return null;
  }

  executeTeamCommand(player, commandType) {
    const team = this.teams.get(player.teamId);
    if (!team) return;
    
    // 将指令广播给队伍中的所有玩家
    for (const teamPlayer of team.players.values()) {
      if (teamPlayer.socketId !== player.socketId) {
        // 设置AI玩家的目标
        if (teamPlayer.isAI) {
          switch (commandType) {
            case TEAM_COMMANDS.DEFEND_BED:
              // 保护床
              const bed = this.beds.get(teamPlayer.teamId);
              if (bed) {
                teamPlayer.aiTarget = { x: bed.x, y: bed.y, type: 'defend' };
              }
              break;
            case TEAM_COMMANDS.ATTACK:
              // 攻击最近的敌人
              const nearestEnemy = this.findNearestEnemy(teamPlayer);
              if (nearestEnemy) {
                teamPlayer.aiTarget = { 
                  x: nearestEnemy.x, 
                  y: nearestEnemy.y, 
                  type: 'attack' 
                };
              }
              break;
            case TEAM_COMMANDS.FOLLOW_ME:
              // 跟随发出指令的玩家
              teamPlayer.aiTarget = { 
                x: player.x, 
                y: player.y, 
                type: 'follow',
                followPlayer: player.socketId 
              };
              break;
          }
        }
      }
    }
  }

  getGameState() {
    return {
      id: this.id,
      state: this.gameState,
      startTime: this.startTime,
      winnerTeam: this.winnerTeam,
      players: Array.from(this.players.values()).map(p => this.serializePlayer(p)),
      teams: Array.from(this.teams.values()).map(t => this.serializeTeam(t)),
      resources: this.resources.map(r => this.serializeResource(r)),
      projectiles: this.projectiles.map(p => this.serializeProjectile(p)),
      beds: Array.from(this.beds.values()).map(b => this.serializeBed(b)),
      config: GAME_CONFIG,
      shopItems: SHOP_ITEMS,
      resourceTypes: RESOURCE_TYPES
    };
  }

  serializePlayer(player) {
    return {
      id: player.socketId,
      name: player.name,
      teamId: player.teamId,
      x: player.x,
      y: player.y,
      health: player.health,
      maxHealth: player.maxHealth,
      resources: player.resources,
      inventory: player.inventory,
      weapon: player.weapon,
      armor: player.armor,
      kills: player.kills,
      isDead: player.isDead,
      isAI: player.isAI,
      direction: player.direction,
      speed: player.speed
    };
  }

  serializeTeam(team) {
    return {
      id: team.id,
      color: team.color,
      playerCount: team.players.size
    };
  }

  serializeResource(resource) {
    return {
      id: resource.id,
      type: resource.type,
      x: resource.x,
      y: resource.y,
      collected: resource.collected
    };
  }

  serializeProjectile(projectile) {
    return {
      id: projectile.id,
      type: projectile.type,
      x: projectile.x,
      y: projectile.y,
      direction: projectile.direction,
      speed: projectile.speed,
      damage: projectile.damage,
      ownerId: projectile.ownerId
    };
  }

  serializeBed(bed) {
    return {
      teamId: bed.teamId,
      x: bed.x,
      y: bed.y,
      health: bed.health,
      maxHealth: bed.maxHealth
    };
  }
}

class Player {
  constructor(socketId, name) {
    this.socketId = socketId;
    this.name = name || `Player_${Math.floor(Math.random() * 1000)}`;
    this.teamId = null;
    this.x = 0;
    this.y = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.resources = {};
    this.inventory = [];
    this.weapon = null;
    this.armor = null;
    this.kills = 0;
    this.isDead = false;
    this.isAI = false;
    this.direction = 0;
    this.speed = 2;
    this.attackCooldown = 0;
    this.aiTarget = null;
  }
}

class Team {
  constructor(id, color) {
    this.id = id;
    this.color = color;
    this.players = new Map(); // socketId -> Player
  }

  addPlayer(player) {
    this.players.set(player.socketId, player);
    player.teamId = this.id;
  }

  removePlayer(player) {
    this.players.delete(player.socketId);
  }
}

class Resource {
  constructor(type, x, y) {
    this.id = uuidv4();
    this.type = type;
    this.x = x;
    this.y = y;
    this.collected = false;
  }
}

class Bed {
  constructor(teamId, x, y) {
    this.teamId = teamId;
    this.x = x;
    this.y = y;
    this.health = 100;
    this.maxHealth = 100;
  }
}

class Projectile {
  constructor(type, x, y, direction, ownerId, damage) {
    this.id = uuidv4();
    this.type = type;
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.speed = 5;
    this.damage = damage;
    this.ownerId = ownerId;
  }

  update() {
    this.x += Math.cos(this.direction) * this.speed;
    this.y += Math.sin(this.direction) * this.speed;
  }
}

// 创建游戏实例
const game = new Game();

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // 玩家加入游戏
  socket.on('joinGame', (data) => {
    const playerName = data.name || `Player_${socket.id.substring(0, 4)}`;
    const player = game.addPlayer(socket.id, playerName);
    
    // 发送游戏状态给新玩家
    socket.emit('gameState', game.getGameState());
    socket.emit('playerId', { id: socket.id, name: player.name });
    
    // 通知其他玩家有新玩家加入
    socket.broadcast.emit('playerJoined', {
      id: socket.id,
      name: player.name,
      teamId: player.teamId
    });
    
    console.log(`Player joined: ${player.name} (${socket.id})`);
    
    // 如果有足够的玩家，自动开始游戏
    if (game.players.size >= 2 && game.gameState === 'waiting') {
      game.startGame();
      io.emit('gameStarted');
    }
  });

  // 玩家移动
  socket.on('playerMove', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      player.x = data.x;
      player.y = data.y;
      player.direction = data.direction || player.direction;
      
      // 广播移动给其他玩家
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: player.x,
        y: player.y,
        direction: player.direction
      });
    }
  });

  // 玩家攻击
  socket.on('playerAttack', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead && player.health > 0) {
      const targetPlayer = game.players.get(data.targetId);
      if (targetPlayer && targetPlayer.teamId !== player.teamId) {
        game.attackPlayer(player, targetPlayer);
        
        // 广播攻击动画
        io.emit('playerAttacked', {
          attackerId: socket.id,
          targetId: data.targetId,
          damage: player.weapon ? player.weapon.damage : 3
        });
      }
    }
  });

  // 收集资源
  socket.on('collectResource', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      const resource = game.resources.find(r => r.id === data.resourceId);
      if (resource) {
        game.collectResource(player, resource);
        
        // 广播资源被收集
        io.emit('resourceCollected', {
          resourceId: data.resourceId,
          playerId: socket.id
        });
      }
    }
  });

  // 购买物品
  socket.on('buyItem', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      const success = game.buyItem(player, data.itemId);
      
      if (success) {
        socket.emit('itemPurchased', {
          itemId: data.itemId,
          playerId: socket.id
        });
        
        // 广播玩家购买了物品
        socket.broadcast.emit('playerBoughtItem', {
          playerId: socket.id,
          itemId: data.itemId
        });
      } else {
        socket.emit('purchaseFailed', {
          itemId: data.itemId,
          reason: '资源不足'
        });
      }
    }
  });

  // 团队指令
  socket.on('teamCommand', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      game.executeTeamCommand(player, data.commandType);
      
      // 广播团队指令
      io.emit('teamCommandExecuted', {
        playerId: socket.id,
        teamId: player.teamId,
        commandType: data.commandType
      });
    }
  });

  // 破坏床
  socket.on('breakBed', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      const bed = game.beds.get(data.teamId);
      if (bed && bed.teamId !== player.teamId) {
        // 造成伤害
        const damage = player.weapon ? player.weapon.damage * 2 : 6;
        bed.health -= damage;
        
        // 检查床是否被破坏
        if (bed.health <= 0) {
          // 通知队伍床被破坏
          io.emit('bedDestroyed', {
            teamId: bed.teamId,
            destroyerId: socket.id
          });
        }
        
        // 广播床受到攻击
        io.emit('bedDamaged', {
          teamId: bed.teamId,
          health: bed.health,
          maxHealth: bed.maxHealth
        });
      }
    }
  });

  // 使用物品
  socket.on('useItem', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      const item = player.inventory.find(i => i.id === data.itemId);
      if (item) {
        // 处理不同类型的物品
        switch (item.type) {
          case 'special':
            if (item.id === 'tnt') {
              // 创建TNT投掷物
              const projectile = new Projectile(
                'tnt',
                player.x,
                player.y,
                player.direction,
                socket.id,
                item.damage
              );
              game.projectiles.push(projectile);
              
              // 广播TNT被投掷
              io.emit('projectileCreated', {
                projectile: game.serializeProjectile(projectile)
              });
            }
            break;
        }
        
        // 移除已使用的物品
        const index = player.inventory.findIndex(i => i.id === data.itemId);
        if (index > -1) {
          player.inventory.splice(index, 1);
        }
      }
    }
  });

  // 添加AI玩家
  socket.on('addAI', () => {
    // 创建AI玩家
    const aiPlayer = new Player(uuidv4(), `AI_${Math.floor(Math.random() * 1000)}`);
    aiPlayer.isAI = true;
    
    // 分配到人数最少的队伍
    const teamId = game.findLeastPopulatedTeam();
    aiPlayer.teamId = teamId;
    
    // 如果队伍不存在，创建新队伍
    if (!game.teams.has(teamId)) {
      const teamColor = game.getTeamColor(teamId);
      game.teams.set(teamId, new Team(teamId, teamColor));
      
      // 为队伍创建床
      const bedPosition = game.getTeamSpawnPosition(teamId);
      const bed = new Bed(teamId, bedPosition.x, bedPosition.y);
      game.beds.set(teamId, bed);
    }
    
    // 添加玩家到队伍
    game.teams.get(teamId).addPlayer(aiPlayer);
    game.players.set(aiPlayer.socketId, aiPlayer);
    
    // 设置AI玩家初始位置
    const spawnPos = game.getTeamSpawnPosition(teamId);
    aiPlayer.x = spawnPos.x;
    aiPlayer.y = spawnPos.y;
    
    // 广播AI玩家加入
    io.emit('playerJoined', {
      id: aiPlayer.socketId,
      name: aiPlayer.name,
      teamId: aiPlayer.teamId,
      isAI: true
    });
    
    // 如果有足够的玩家，开始游戏
    if (game.players.size >= 2 && game.gameState === 'waiting') {
      game.startGame();
      io.emit('gameStarted');
    }
    
    console.log(`AI player added: ${aiPlayer.name} (${aiPlayer.socketId})`);
  });

  // 玩家断开连接
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    game.removePlayer(socket.id);
    
    // 通知其他玩家
    io.emit('playerLeft', { id: socket.id });
  });

  // 发送按键事件（用于F键团队指令）
  socket.on('keyPress', (data) => {
    if (data.key === 'F' || data.key === 'f') {
      // 打开团队指令菜单
      socket.emit('openTeamCommands');
    }
  });

  // 选择团队指令
  socket.on('selectTeamCommand', (data) => {
    const player = game.players.get(socket.id);
    if (player && !player.isDead) {
      game.executeTeamCommand(player, data.commandType);
      
      io.emit('teamCommandExecuted', {
        playerId: socket.id,
        teamId: player.teamId,
        commandType: data.commandType
      });
    }
  });
});

// 定期广播游戏状态
setInterval(() => {
  io.emit('gameUpdate', game.getGameState());
}, 100);

// 更新投掷物
setInterval(() => {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const projectile = game.projectiles[i];
    projectile.update();
    
    // 检查是否命中玩家
    for (const player of game.players.values()) {
      if (player.socketId !== projectile.ownerId && !player.isDead) {
        const distance = Math.sqrt(
          Math.pow(projectile.x - player.x, 2) + 
          Math.pow(projectile.y - player.y, 2)
        );
        
        if (distance < 30) {
          // 命中玩家
          player.health -= projectile.damage;
          
          // 检查玩家是否死亡
          if (player.health <= 0) {
            const attacker = game.players.get(projectile.ownerId);
            game.playerDied(player, attacker);
          }
          
          // 移除投掷物
          game.projectiles.splice(i, 1);
          
          // 广播命中
          io.emit('projectileHit', {
            projectileId: projectile.id,
            targetId: player.socketId,
            damage: projectile.damage
          });
          
          break;
        }
      }
    }
    
    // 检查是否命中床
    for (const bed of game.beds.values()) {
      const distance = Math.sqrt(
        Math.pow(projectile.x - bed.x, 2) + 
        Math.pow(projectile.y - bed.y, 2)
      );
      
      if (distance < 40) {
        bed.health -= projectile.damage;
        
        // 检查床是否被破坏
        if (bed.health <= 0) {
          io.emit('bedDestroyed', {
            teamId: bed.teamId,
            destroyerId: projectile.ownerId
          });
        }
        
        // 移除投掷物
        game.projectiles.splice(i, 1);
        
        // 广播床受到投掷物攻击
        io.emit('bedDamaged', {
          teamId: bed.teamId,
          health: bed.health,
          maxHealth: bed.maxHealth
        });
        
        break;
      }
    }
    
    // 检查是否超出边界
    if (projectile.x < 0 || projectile.x > GAME_CONFIG.mapSize.width ||
        projectile.y < 0 || projectile.y > GAME_CONFIG.mapSize.height) {
      game.projectiles.splice(i, 1);
    }
  }
}, 50);

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`BedWars server running on port ${PORT}`);
  console.log(`Open your browser and navigate to http://localhost:${PORT}`);
});

// 导出游戏实例用于测试
module.exports = { game, GAME_CONFIG, RESOURCE_TYPES, SHOP_ITEMS, TEAM_COMMANDS };
