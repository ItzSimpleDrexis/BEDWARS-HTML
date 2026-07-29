const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// 服务器配置
const PORT = process.env.PORT || 3000;

// 游戏配置
const GAME_CONFIG = {
  maxPlayers: 8,
  minPlayers: 2,
  respawnTime: 5000, // 5秒重生
  gameDuration: 300000, // 5分钟游戏时长
  mapSize: { width: 100, height: 100 },
  teamColors: ['red', 'blue', 'green', 'yellow'],
  resources: {
    iron: { spawnRate: 10000, value: 1 }, // 铁锭
    gold: { spawnRate: 15000, value: 2 }, // 金锭
    diamond: { spawnRate: 30000, value: 3 }, // 钻石
    emerald: { spawnRate: 60000, value: 4 } // 绿宝石
  }
};

// 游戏状态
let gameState = {
  players: [],
  teams: [],
  resources: [],
  beds: [],
  shops: [],
  projectiles: [],
  gameStarted: false,
  gameTime: 0,
  winner: null
};

// 创建AI玩家
function createAIPlayer(teamId) {
  const team = gameState.teams.find(t => t.id === teamId);
  if (!team) return null;
  
  const aiPlayer = {
    id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: `AI_${team.color.toUpperCase()}_${team.players.length + 1}`,
    x: team.spawnPoint.x + Math.random() * 20 - 10,
    y: team.spawnPoint.y + Math.random() * 20 - 10,
    health: 100,
    maxHealth: 100,
    teamId: teamId,
    isAI: true,
    inventory: {
      iron: 0,
      gold: 0,
      diamond: 0,
      emerald: 0
    },
    equipment: {
      weapon: 'sword',
      armor: 'none'
    },
    isAlive: true,
    lastAttack: 0,
    target: null,
    action: 'idle',
    lastActionTime: 0
  };
  
  return aiPlayer;
}

// AI行为逻辑
function updateAI(aiPlayer) {
  if (!aiPlayer.isAlive) return;
  
  const now = Date.now();
  const team = gameState.teams.find(t => t.id === aiPlayer.teamId);
  if (!team) return;
  
  // 如果床被破坏，AI会慌乱
  if (team.bedDestroyed) {
    aiPlayer.action = 'panic';
    // 尝试攻击敌人
    const enemies = gameState.players.filter(p => 
      p.teamId !== aiPlayer.teamId && p.isAlive && !p.isAI
    );
    
    if (enemies.length > 0) {
      const closestEnemy = enemies.reduce((closest, enemy) => {
        const dist = Math.sqrt(
          Math.pow(enemy.x - aiPlayer.x, 2) + 
          Math.pow(enemy.y - aiPlayer.y, 2)
        );
        const closestDist = Math.sqrt(
          Math.pow(closest.x - aiPlayer.x, 2) + 
          Math.pow(closest.y - aiPlayer.y, 2)
        );
        return dist < closestDist ? enemy : closest;
      }, enemies[0]);
      
      aiPlayer.target = closestEnemy;
      aiPlayer.action = 'attack';
      
      // 移动到敌人
      const angle = Math.atan2(
        closestEnemy.y - aiPlayer.y,
        closestEnemy.x - aiPlayer.x
      );
      aiPlayer.x += Math.cos(angle) * 2;
      aiPlayer.y += Math.sin(angle) * 2;
      
      // 攻击
      if (now - aiPlayer.lastAttack > 1000) {
        closestEnemy.health -= 10;
        aiPlayer.lastAttack = now;
        if (closestEnemy.health <= 0) {
          closestEnemy.isAlive = false;
          closestEnemy.respawnTime = now + GAME_CONFIG.respawnTime;
        }
      }
    }
    return;
  }
  
  // 正常AI行为
  switch(aiPlayer.action) {
    case 'defend':
      // 守卫床
      if (team.bed) {
        const bed = gameState.beds.find(b => b.teamId === aiPlayer.teamId);
        if (bed) {
          const dist = Math.sqrt(
            Math.pow(bed.x - aiPlayer.x, 2) + 
            Math.pow(bed.y - aiPlayer.y, 2)
          );
          
          if (dist > 10) {
            // 移动到床附近
            const angle = Math.atan2(bed.y - aiPlayer.y, bed.x - aiPlayer.x);
            aiPlayer.x += Math.cos(angle) * 1;
            aiPlayer.y += Math.sin(angle) * 1;
          } else {
            // 守卫床，攻击附近的敌人
            const enemies = gameState.players.filter(p => 
              p.teamId !== aiPlayer.teamId && p.isAlive && 
              Math.sqrt(
                Math.pow(p.x - aiPlayer.x, 2) + 
                Math.pow(p.y - aiPlayer.y, 2)
              ) < 20
            );
            
            if (enemies.length > 0) {
              const closestEnemy = enemies.reduce((closest, enemy) => {
                const dist = Math.sqrt(
                  Math.pow(enemy.x - aiPlayer.x, 2) + 
                  Math.pow(enemy.y - aiPlayer.y, 2)
                );
                const closestDist = Math.sqrt(
                  Math.pow(closest.x - aiPlayer.x, 2) + 
                  Math.pow(closest.y - aiPlayer.y, 2)
                );
                return dist < closestDist ? enemy : closest;
              }, enemies[0]);
              
              const angle = Math.atan2(
                closestEnemy.y - aiPlayer.y,
                closestEnemy.x - aiPlayer.x
              );
              aiPlayer.x += Math.cos(angle) * 2;
              aiPlayer.y += Math.sin(angle) * 2;
              
              if (now - aiPlayer.lastAttack > 1000) {
                closestEnemy.health -= 10;
                aiPlayer.lastAttack = now;
                if (closestEnemy.health <= 0) {
                  closestEnemy.isAlive = false;
                  closestEnemy.respawnTime = now + GAME_CONFIG.respawnTime;
                }
              }
            }
          }
        }
      }
      break;
      
    case 'attack':
      // 攻击敌人
      const allEnemies = gameState.players.filter(p => 
        p.teamId !== aiPlayer.teamId && p.isAlive
      );
      
      if (allEnemies.length > 0) {
        const closestEnemy = allEnemies.reduce((closest, enemy) => {
          const dist = Math.sqrt(
            Math.pow(enemy.x - aiPlayer.x, 2) + 
            Math.pow(enemy.y - aiPlayer.y, 2)
          );
          const closestDist = Math.sqrt(
            Math.pow(closest.x - aiPlayer.x, 2) + 
            Math.pow(closest.y - aiPlayer.y, 2)
          );
          return dist < closestDist ? enemy : closest;
        }, allEnemies[0]);
        
        const dist = Math.sqrt(
          Math.pow(closestEnemy.x - aiPlayer.x, 2) + 
          Math.pow(closestEnemy.y - aiPlayer.y, 2)
        );
        
        if (dist > 5) {
          const angle = Math.atan2(
            closestEnemy.y - aiPlayer.y,
            closestEnemy.x - aiPlayer.x
          );
          aiPlayer.x += Math.cos(angle) * 2;
          aiPlayer.y += Math.sin(angle) * 2;
        }
        
        if (now - aiPlayer.lastAttack > 1000) {
          closestEnemy.health -= 10;
          aiPlayer.lastAttack = now;
          if (closestEnemy.health <= 0) {
            closestEnemy.isAlive = false;
            closestEnemy.respawnTime = now + GAME_CONFIG.respawnTime;
          }
        }
      } else {
        // 没有敌人，收集资源
        aiPlayer.action = 'collect';
      }
      break;
      
    case 'collect':
      // 收集资源
      const nearbyResources = gameState.resources.filter(r => 
        Math.sqrt(
          Math.pow(r.x - aiPlayer.x, 2) + 
          Math.pow(r.y - aiPlayer.y, 2)
        ) < 30
      );
      
      if (nearbyResources.length > 0) {
        const closestResource = nearbyResources.reduce((closest, resource) => {
          const dist = Math.sqrt(
            Math.pow(resource.x - aiPlayer.x, 2) + 
            Math.pow(resource.y - aiPlayer.y, 2)
          );
          const closestDist = Math.sqrt(
            Math.pow(closest.x - aiPlayer.x, 2) + 
            Math.pow(closest.y - aiPlayer.y, 2)
          );
          return dist < closestDist ? resource : closest;
        }, nearbyResources[0]);
        
        const dist = Math.sqrt(
          Math.pow(closestResource.x - aiPlayer.x, 2) + 
          Math.pow(closestResource.y - aiPlayer.y, 2)
        );
        
        if (dist > 2) {
          const angle = Math.atan2(
            closestResource.y - aiPlayer.y,
            closestResource.x - aiPlayer.x
          );
          aiPlayer.x += Math.cos(angle) * 2;
          aiPlayer.y += Math.sin(angle) * 2;
        } else {
          // 收集资源
          aiPlayer.inventory[closestResource.type] += closestResource.value;
          gameState.resources = gameState.resources.filter(
            r => r.id !== closestResource.id
          );
        }
      } else {
        // 回到床附近
        aiPlayer.action = 'defend';
      }
      break;
      
    default:
      // 随机行为
      const actions = ['defend', 'attack', 'collect'];
      const randomAction = actions[Math.floor(Math.random() * actions.length)];
      aiPlayer.action = randomAction;
      aiPlayer.lastActionTime = now;
  }
  
  // 随机改变行为
  if (now - aiPlayer.lastActionTime > 5000) {
    const actions = ['defend', 'attack', 'collect'];
    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    aiPlayer.action = randomAction;
    aiPlayer.lastActionTime = now;
  }
}

// 初始化游戏
function initGame() {
  gameState = {
    players: [],
    teams: [],
    resources: [],
    beds: [],
    shops: [],
    projectiles: [],
    gameStarted: false,
    gameTime: 0,
    winner: null
  };
  
  // 创建队伍 (1v1到4v4)
  const numTeams = Math.min(4, Math.ceil(gameState.players.length / 2));
  for (let i = 0; i < numTeams; i++) {
    const teamColor = GAME_CONFIG.teamColors[i];
    const spawnX = 20 + i * 60;
    const spawnY = 20 + (i % 2) * 60;
    
    gameState.teams.push({
      id: `team_${i}`,
      color: teamColor,
      name: `Team ${teamColor.toUpperCase()}`,
      players: [],
      spawnPoint: { x: spawnX, y: spawnY },
      bedDestroyed: false,
      score: 0
    });
    
    // 创建床
    gameState.beds.push({
      id: `bed_${i}`,
      teamId: `team_${i}`,
      x: spawnX,
      y: spawnY,
      health: 100,
      maxHealth: 100
    });
    
    // 创建商店
    gameState.shops.push({
      id: `shop_${i}`,
      teamId: `team_${i}`,
      x: spawnX + 15,
      y: spawnY + 15,
      items: [
        { id: 'sword', name: '铁剑', cost: { iron: 10 }, type: 'weapon' },
        { id: 'bow', name: '弓', cost: { gold: 5 }, type: 'weapon' },
        { id: 'leather_armor', name: '皮甲', cost: { iron: 5 }, type: 'armor' },
        { id: 'iron_armor', name: '铁甲', cost: { iron: 20 }, type: 'armor' },
        { id: 'gold_armor', name: '金甲', cost: { gold: 15 }, type: 'armor' },
        { id: 'diamond_armor', name: '钻石甲', cost: { diamond: 10 }, type: 'armor' },
        { id: 'block', name: '方块', cost: { iron: 1 }, type: 'block' },
        { id: 'tnt', name: 'TNT', cost: { gold: 3, iron: 5 }, type: 'explosive' }
      ]
    });
  }
  
  // 分配玩家到队伍
  gameState.players.forEach((player, index) => {
    const teamIndex = index % numTeams;
    const team = gameState.teams[teamIndex];
    player.teamId = team.id;
    player.x = team.spawnPoint.x + Math.random() * 20 - 10;
    player.y = team.spawnPoint.y + Math.random() * 20 - 10;
    team.players.push(player);
  });
  
  // 为每个队伍创建AI玩家
  gameState.teams.forEach(team => {
    // 每个队伍最多3个AI
    const aiCount = Math.min(3, 4 - team.players.length);
    for (let i = 0; i < aiCount; i++) {
      const aiPlayer = createAIPlayer(team.id);
      if (aiPlayer) {
        gameState.players.push(aiPlayer);
        team.players.push(aiPlayer);
      }
    }
  });
  
  gameState.gameStarted = true;
  gameState.gameTime = Date.now();
}

// 生成资源
function spawnResources() {
  const now = Date.now();
  
  // 铁锭 - 每10秒生成
  if (now - (gameState.lastIronSpawn || 0) > GAME_CONFIG.resources.iron.spawnRate) {
    const x = 20 + Math.random() * (GAME_CONFIG.mapSize.width - 40);
    const y = 20 + Math.random() * (GAME_CONFIG.mapSize.height - 40);
    gameState.resources.push({
      id: `iron_${Date.now()}`,
      type: 'iron',
      x: x,
      y: y,
      value: GAME_CONFIG.resources.iron.value,
      spawnTime: now
    });
    gameState.lastIronSpawn = now;
  }
  
  // 金锭 - 每15秒生成
  if (now - (gameState.lastGoldSpawn || 0) > GAME_CONFIG.resources.gold.spawnRate) {
    const x = 20 + Math.random() * (GAME_CONFIG.mapSize.width - 40);
    const y = 20 + Math.random() * (GAME_CONFIG.mapSize.height - 40);
    gameState.resources.push({
      id: `gold_${Date.now()}`,
      type: 'gold',
      x: x,
      y: y,
      value: GAME_CONFIG.resources.gold.value,
      spawnTime: now
    });
    gameState.lastGoldSpawn = now;
  }
  
  // 钻石 - 每30秒生成
  if (now - (gameState.lastDiamondSpawn || 0) > GAME_CONFIG.resources.diamond.spawnRate) {
    const x = 20 + Math.random() * (GAME_CONFIG.mapSize.width - 40);
    const y = 20 + Math.random() * (GAME_CONFIG.mapSize.height - 40);
    gameState.resources.push({
      id: `diamond_${Date.now()}`,
      type: 'diamond',
      x: x,
      y: y,
      value: GAME_CONFIG.resources.diamond.value,
      spawnTime: now
    });
    gameState.lastDiamondSpawn = now;
  }
  
  // 绿宝石 - 每60秒生成
  if (now - (gameState.lastEmeraldSpawn || 0) > GAME_CONFIG.resources.emerald.spawnRate) {
    const x = 20 + Math.random() * (GAME_CONFIG.mapSize.width - 40);
    const y = 20 + Math.random() * (GAME_CONFIG.mapSize.height - 40);
    gameState.resources.push({
      id: `emerald_${Date.now()}`,
      type: 'emerald',
      x: x,
      y: y,
      value: GAME_CONFIG.resources.emerald.value,
      spawnTime: now
    });
    gameState.lastEmeraldSpawn = now;
  }
}

// 游戏循环
function gameLoop() {
  if (!gameState.gameStarted) return;
  
  const now = Date.now();
  
  // 检查游戏时间
  if (now - gameState.gameTime > GAME_CONFIG.gameDuration) {
    // 游戏结束
    const aliveTeams = gameState.teams.filter(team => 
      !team.bedDestroyed && team.players.some(p => p.isAlive)
    );
    
    if (aliveTeams.length === 1) {
      gameState.winner = aliveTeams[0].id;
    } else if (aliveTeams.length === 0) {
      // 所有床都被破坏，分数最高的队伍获胜
      const maxScore = Math.max(...gameState.teams.map(t => t.score));
      const winningTeams = gameState.teams.filter(t => t.score === maxScore);
      if (winningTeams.length === 1) {
        gameState.winner = winningTeams[0].id;
      }
    }
    
    gameState.gameStarted = false;
    io.emit('game_end', { winner: gameState.winner });
    return;
  }
  
  // 生成资源
  spawnResources();
  
  // 更新AI
  gameState.players.filter(p => p.isAI).forEach(updateAI);
  
  // 更新玩家状态
  gameState.players.forEach(player => {
    if (!player.isAlive && now - player.respawnTime >= 0) {
      // 重生
      const team = gameState.teams.find(t => t.id === player.teamId);
      if (team && !team.bedDestroyed) {
        player.x = team.spawnPoint.x + Math.random() * 10 - 5;
        player.y = team.spawnPoint.y + Math.random() * 10 - 5;
        player.health = player.maxHealth;
        player.isAlive = true;
      }
    }
  });
  
  // 广播游戏状态
  io.emit('game_update', {
    players: gameState.players.map(p => ({
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      health: p.health,
      maxHealth: p.maxHealth,
      teamId: p.teamId,
      isAI: p.isAI,
      isAlive: p.isAlive,
      inventory: p.inventory,
      equipment: p.equipment,
      action: p.isAI ? p.action : undefined
    })),
    teams: gameState.teams.map(t => ({
      id: t.id,
      color: t.color,
      name: t.name,
      bedDestroyed: t.bedDestroyed,
      score: t.score
    })),
    beds: gameState.beds.map(b => ({
      id: b.id,
      teamId: b.teamId,
      x: b.x,
      y: b.y,
      health: b.health,
      maxHealth: b.maxHealth
    })),
    resources: gameState.resources,
    shops: gameState.shops,
    timeRemaining: Math.max(0, (GAME_CONFIG.gameDuration - (now - gameState.gameTime)) / 1000)
  });
}

// 设置Express
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io连接
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // 玩家加入
  socket.on('join_game', (data) => {
    const player = {
      id: socket.id,
      name: data.name || `Player_${socket.id.substr(0, 6)}`,
      x: 0,
      y: 0,
      health: 100,
      maxHealth: 100,
      teamId: null,
      isAI: false,
      inventory: {
        iron: 0,
        gold: 0,
        diamond: 0,
        emerald: 0
      },
      equipment: {
        weapon: 'sword',
        armor: 'none'
      },
      isAlive: true,
      lastAttack: 0
    };
    
    gameState.players.push(player);
    socket.emit('player_joined', { playerId: player.id });
    
    // 如果玩家数量足够，开始游戏
    if (gameState.players.filter(p => !p.isAI).length >= GAME_CONFIG.minPlayers && !gameState.gameStarted) {
      initGame();
    }
  });
  
  // 玩家移动
  socket.on('player_move', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (player && player.isAlive) {
      player.x = data.x;
      player.y = data.y;
    }
  });
  
  // 玩家攻击
  socket.on('player_attack', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) return;
    
    const now = Date.now();
    if (now - player.lastAttack < 1000) return; // 攻击冷却
    
    const target = gameState.players.find(p => p.id === data.targetId);
    if (target && target.teamId !== player.teamId && target.isAlive) {
      const damage = 10; // 基础伤害
      target.health -= damage;
      player.lastAttack = now;
      
      if (target.health <= 0) {
        target.isAlive = false;
        target.respawnTime = now + GAME_CONFIG.respawnTime;
        
        // 如果目标是AI，增加分数
        if (target.isAI) {
          const team = gameState.teams.find(t => t.id === player.teamId);
          if (team) {
            team.score += 1;
          }
        }
      }
      
      socket.emit('attack_result', {
        targetId: target.id,
        damage: damage,
        targetHealth: target.health
      });
    }
  });
  
  // 收集资源
  socket.on('collect_resource', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) return;
    
    const resource = gameState.resources.find(r => r.id === data.resourceId);
    if (resource) {
      player.inventory[resource.type] += resource.value;
      gameState.resources = gameState.resources.filter(r => r.id !== resource.id);
      socket.emit('resource_collected', {
        resourceId: resource.id,
        type: resource.type,
        value: resource.value
      });
    }
  });
  
  // 购买物品
  socket.on('buy_item', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) return;
    
    const shop = gameState.shops.find(s => s.teamId === player.teamId);
    if (!shop) return;
    
    const item = shop.items.find(i => i.id === data.itemId);
    if (!item) return;
    
    // 检查资源是否足够
    let canBuy = true;
    for (const [resource, amount] of Object.entries(item.cost)) {
      if ((player.inventory[resource] || 0) < amount) {
        canBuy = false;
        break;
      }
    }
    
    if (canBuy) {
      // 扣除资源
      for (const [resource, amount] of Object.entries(item.cost)) {
        player.inventory[resource] -= amount;
      }
      
      // 获得物品
      if (item.type === 'weapon') {
        player.equipment.weapon = item.id;
      } else if (item.type === 'armor') {
        player.equipment.armor = item.id;
      }
      
      socket.emit('item_purchased', {
        itemId: item.id,
        itemName: item.name,
        inventory: player.inventory
      });
    } else {
      socket.emit('buy_failed', { message: '资源不足' });
    }
  });
  
  // 破坏床
  socket.on('destroy_bed', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) return;
    
    const bed = gameState.beds.find(b => b.id === data.bedId);
    if (bed && bed.teamId !== player.teamId) {
      bed.health -= 30; // 破坏床需要更多伤害
      
      if (bed.health <= 0) {
        const team = gameState.teams.find(t => t.id === bed.teamId);
        if (team) {
          team.bedDestroyed = true;
          // 该队伍的玩家无法重生
          gameState.players.filter(p => p.teamId === bed.teamId).forEach(p => {
            p.isAlive = false;
          });
        }
        
        // 破坏床的玩家获得分数
        const playerTeam = gameState.teams.find(t => t.id === player.teamId);
        if (playerTeam) {
          playerTeam.score += 5;
        }
      }
      
      socket.emit('bed_damaged', {
        bedId: bed.id,
        health: bed.health,
        destroyed: bed.health <= 0
      });
    }
  });
  
  // 团队指令 (F键)
  socket.on('team_command', (data) => {
    const player = gameState.players.find(p => p.id === socket.id);
    if (!player) return;
    
    const team = gameState.teams.find(t => t.id === player.teamId);
    if (!team) return;
    
    // 广播团队指令给所有AI队友
    team.players.filter(p => p.isAI).forEach(aiPlayer => {
      switch(data.command) {
        case 'defend_bed':
          aiPlayer.action = 'defend';
          aiPlayer.lastActionTime = Date.now();
          break;
        case 'attack':
          aiPlayer.action = 'attack';
          aiPlayer.lastActionTime = Date.now();
          break;
        case 'follow':
          aiPlayer.target = player;
          aiPlayer.action = 'follow';
          aiPlayer.lastActionTime = Date.now();
          break;
      }
    });
    
    // 广播指令给团队中的其他真实玩家
    team.players.filter(p => !p.isAI && p.id !== player.id).forEach(teammate => {
      const teammateSocket = io.sockets.sockets.get(teammate.id);
      if (teammateSocket) {
        teammateSocket.emit('team_command_received', {
          playerId: player.id,
          playerName: player.name,
          command: data.command
        });
      }
    });
  });
  
  // 玩家断开连接
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    gameState.players = gameState.players.filter(p => p.id !== socket.id);
    
    // 从队伍中移除玩家
    gameState.teams.forEach(team => {
      team.players = team.players.filter(p => p.id !== socket.id);
    });
  });
});

// 启动服务器
server.listen(PORT, () => {
  console.log(`BedWars server running on port ${PORT}`);
});

// 启动游戏循环
setInterval(gameLoop, 1000 / 30); // 30fps

module.exports = { app, server, io, gameState, GAME_CONFIG };
