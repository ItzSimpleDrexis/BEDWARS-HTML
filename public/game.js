// 游戏客户端主脚本
class GameClient {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.playerId = null;
        this.playerName = '';
        this.gameState = null;
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.lastUpdateTime = 0;
        this.animationFrameId = null;
        this.selectedItem = null;
        this.teamCommandsOpen = false;
        this.shopOpen = false;
        this.messageQueue = [];
        this.damageTexts = [];
        this.collectEffects = [];
        
        // 绑定事件
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseClick = this.handleMouseClick.bind(this);
        
        // 初始化
        this.init();
    }
    
    init() {
        // 获取DOM元素
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }
        
        // 设置画布大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.ctx = this.canvas.getContext('2d');
        
        // 连接Socket.IO
        this.connectSocket();
        
        // 绑定键盘事件
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        
        // 绑定鼠标事件
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('click', this.handleMouseClick);
        
        // 绑定按钮事件
        this.bindUIEvents();
        
        // 显示开始界面
        this.showStartScreen();
    }
    
    resizeCanvas() {
        const container = document.getElementById('game-container');
        if (container) {
            this.canvas.width = Math.min(window.innerWidth - 40, 800);
            this.canvas.height = Math.min(window.innerHeight - 40, 600);
        } else {
            this.canvas.width = Math.min(window.innerWidth - 40, 800);
            this.canvas.height = Math.min(window.innerHeight - 40, 600);
        }
    }
    
    connectSocket() {
        // 连接到本地服务器
        this.socket = io(window.location.origin);
        
        // 连接事件
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showMessage('与服务器断开连接，正在重连...');
        });
        
        // 游戏状态更新
        this.socket.on('gameState', (state) => {
            this.gameState = state;
            this.updatePlayerInfo();
            this.updateResourceDisplay();
        });
        
        this.socket.on('gameUpdate', (state) => {
            this.gameState = state;
            this.updatePlayerInfo();
            this.updateResourceDisplay();
        });
        
        // 玩家ID
        this.socket.on('playerId', (data) => {
            this.playerId = data.id;
            this.playerName = data.name;
            console.log('Received player ID:', this.playerId);
        });
        
        // 玩家加入
        this.socket.on('playerJoined', (data) => {
            this.showMessage(`${data.name} 加入了游戏`);
            this.updatePlayerCount();
        });
        
        // 玩家离开
        this.socket.on('playerLeft', (data) => {
            this.showMessage(`玩家 ${data.id} 离开游戏`);
            this.updatePlayerCount();
        });
        
        // 玩家移动
        this.socket.on('playerMoved', (data) => {
            // 更新其他玩家的位置
            if (this.gameState && this.gameState.players) {
                const player = this.gameState.players.find(p => p.id === data.id);
                if (player) {
                    player.x = data.x;
                    player.y = data.y;
                    player.direction = data.direction || player.direction;
                }
            }
        });
        
        // 玩家攻击
        this.socket.on('playerAttacked', (data) => {
            this.showDamageText(data.targetId, data.damage);
        });
        
        // 资源被收集
        this.socket.on('resourceCollected', (data) => {
            this.showCollectEffect(data.resourceId, data.playerId);
        });
        
        // 物品购买
        this.socket.on('itemPurchased', (data) => {
            this.showMessage(`购买了 ${this.getItemName(data.itemId)}`);
        });
        
        this.socket.on('purchaseFailed', (data) => {
            this.showMessage(`购买失败: ${data.reason}`);
        });
        
        // 团队指令
        this.socket.on('teamCommandExecuted', (data) => {
            const commandText = this.getCommandText(data.commandType);
            this.showMessage(`${this.getPlayerName(data.playerId)} 发出指令: ${commandText}`);
        });
        
        this.socket.on('openTeamCommands', () => {
            this.toggleTeamCommands();
        });
        
        // 床被破坏
        this.socket.on('bedDestroyed', (data) => {
            this.showMessage(`⚠️ ${this.getTeamName(data.teamId)} 的床被破坏了!`);
        });
        
        // 床受到伤害
        this.socket.on('bedDamaged', (data) => {
            // 可以显示床的血量变化
        });
        
        // 投掷物创建
        this.socket.on('projectileCreated', (data) => {
            // 投掷物将在游戏状态中更新
        });
        
        // 投掷物命中
        this.socket.on('projectileHit', (data) => {
            this.showDamageText(data.targetId, data.damage);
        });
        
        // 游戏开始
        this.socket.on('gameStarted', () => {
            this.hideWaitingScreen();
        });
    }
    
    bindUIEvents() {
        // 开始游戏按钮
        const startBtn = document.getElementById('start-game');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                const nameInput = document.getElementById('player-name-input');
                const teamSelect = document.getElementById('team-select');
                
                const playerName = nameInput.value.trim() || `Player_${Math.floor(Math.random() * 1000)}`;
                const teamId = teamSelect.value;
                
                this.playerName = playerName;
                
                // 发送加入游戏请求
                this.socket.emit('joinGame', { 
                    name: playerName,
                    teamId: teamId || null
                });
                
                // 隐藏开始界面
                this.hideStartScreen();
                
                // 显示等待界面
                this.showWaitingScreen();
            });
        }
        
        // 添加AI玩家按钮
        const addAiBtn = document.getElementById('add-ai');
        if (addAiBtn) {
            addAiBtn.addEventListener('click', () => {
                // 向服务器请求添加AI玩家
                this.socket.emit('addAI');
            });
        }
        
        // 重新开始按钮
        const restartBtn = document.getElementById('restart-game');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                window.location.reload();
            });
        }
        
        // 关闭商店按钮
        const closeShopBtn = document.getElementById('close-shop');
        if (closeShopBtn) {
            closeShopBtn.addEventListener('click', () => {
                this.toggleShop();
            });
        }
        
        // 商店标签切换
        const shopTabs = document.querySelectorAll('.shop-tab');
        shopTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                shopTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.updateShopItems(tab.dataset.category);
            });
        });
        
        // 团队指令按钮
        const commandBtns = document.querySelectorAll('.command-btn');
        commandBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const commandType = btn.dataset.command;
                this.socket.emit('selectTeamCommand', { commandType });
                this.toggleTeamCommands();
            });
        });
    }
    
    handleKeyDown(e) {
        this.keys[e.key] = true;
        
        // 处理特殊按键
        switch (e.key) {
            case ' ':
                this.handleAttack();
                break;
            case 'e':
            case 'E':
                this.toggleShop();
                break;
            case 'f':
            case 'F':
                this.toggleTeamCommands();
                break;
            case 'Escape':
                if (this.shopOpen) {
                    this.toggleShop();
                }
                if (this.teamCommandsOpen) {
                    this.toggleTeamCommands();
                }
                break;
        }
        
        // 发送按键事件到服务器
        this.socket.emit('keyPress', { key: e.key });
    }
    
    handleKeyUp(e) {
        this.keys[e.key] = false;
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = e.clientX - rect.left;
        this.mouse.y = e.clientY - rect.top;
    }
    
    handleMouseClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // 检查是否点击了资源
        if (this.gameState && this.gameState.resources) {
            for (const resource of this.gameState.resources) {
                if (!resource.collected) {
                    const distance = Math.sqrt(
                        Math.pow(mouseX - resource.x, 2) + 
                        Math.pow(mouseY - resource.y, 2)
                    );
                    
                    if (distance < 20) {
                        this.socket.emit('collectResource', { resourceId: resource.id });
                        break;
                    }
                }
            }
        }
        
        // 检查是否点击了床
        if (this.gameState && this.gameState.beds) {
            for (const bed of this.gameState.beds) {
                const distance = Math.sqrt(
                    Math.pow(mouseX - bed.x, 2) + 
                    Math.pow(mouseY - bed.y, 2)
                );
                
                if (distance < 30) {
                    // 如果是敌方床，可以攻击
                    const myPlayer = this.getMyPlayer();
                    if (myPlayer && myPlayer.teamId !== bed.teamId) {
                        this.socket.emit('breakBed', { teamId: bed.teamId });
                    }
                    break;
                }
            }
        }
    }
    
    handleAttack() {
        if (!this.gameState || !this.gameState.players) return;
        
        const myPlayer = this.getMyPlayer();
        if (!myPlayer || myPlayer.isDead) return;
        
        // 寻找最近的敌人
        let nearestEnemy = null;
        let minDistance = Infinity;
        
        for (const player of this.gameState.players) {
            if (player.id !== this.playerId && player.teamId !== myPlayer.teamId && !player.isDead) {
                const distance = Math.sqrt(
                    Math.pow(myPlayer.x - player.x, 2) + 
                    Math.pow(myPlayer.y - player.y, 2)
                );
                
                if (distance < minDistance && distance < 50) {
                    minDistance = distance;
                    nearestEnemy = player;
                }
            }
        }
        
        if (nearestEnemy) {
            this.socket.emit('playerAttack', { targetId: nearestEnemy.id });
        }
    }
    
    toggleShop() {
        this.shopOpen = !this.shopOpen;
        const shopPanel = document.getElementById('shop-panel');
        if (shopPanel) {
            shopPanel.classList.toggle('hidden', !this.shopOpen);
        }
        
        if (this.shopOpen) {
            this.updateShopItems('weapons');
        }
    }
    
    toggleTeamCommands() {
        this.teamCommandsOpen = !this.teamCommandsOpen;
        const panel = document.getElementById('team-commands-panel');
        if (panel) {
            panel.classList.toggle('hidden', !this.teamCommandsOpen);
        }
    }
    
    updateShopItems(category) {
        const shopItemsContainer = document.getElementById('shop-items');
        if (!shopItemsContainer) return;
        
        shopItemsContainer.innerHTML = '';
        
        const myPlayer = this.getMyPlayer();
        if (!myPlayer) return;
        
        const items = this.getShopItemsByCategory(category);
        
        items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'shop-item';
            
            // 检查是否能购买
            const canAfford = myPlayer.resources['铁锭'] >= (item.cost || 0);
            if (!canAfford) {
                itemElement.classList.add('cannot-afford');
            }
            
            // 设置物品数据
            itemElement.dataset.itemId = item.id;
            
            // 物品图标
            const iconElement = document.createElement('div');
            iconElement.className = 'item-icon';
            iconElement.innerHTML = this.getItemIcon(item);
            
            // 物品名称
            const nameElement = document.createElement('div');
            nameElement.className = 'item-name';
            nameElement.textContent = item.name;
            
            // 物品价格
            const costElement = document.createElement('div');
            costElement.className = 'item-cost';
            costElement.textContent = `🪨 ${item.cost || 0}`;
            
            itemElement.appendChild(iconElement);
            itemElement.appendChild(nameElement);
            itemElement.appendChild(costElement);
            
            // 添加点击事件
            itemElement.addEventListener('click', () => {
                if (canAfford) {
                    this.socket.emit('buyItem', { itemId: item.id });
                    this.toggleShop();
                }
            });
            
            shopItemsContainer.appendChild(itemElement);
        });
    }
    
    getShopItemsByCategory(category) {
        if (!this.gameState || !this.gameState.shopItems) return [];
        
        return this.gameState.shopItems[category] || [];
    }
    
    getItemIcon(item) {
        const icons = {
            'wood_sword': '⚔️',
            'stone_sword': '⚔️',
            'iron_sword': '⚔️',
            'diamond_sword': '⚔️',
            'leather_armor': '🛡️',
            'chainmail_armor': '🛡️',
            'iron_armor': '🛡️',
            'diamond_armor': '🛡️',
            'pickaxe': '⛏️',
            'axe': '🪓',
            'shears': '✂️',
            'wool': '🧶',
            'wood': '🪵',
            'stone': '🪨',
            'obsidian': '⬛',
            'tnt': '💣',
            'fireball': '🔥',
            'bed': '🛏️'
        };
        
        return icons[item.id] || '❓';
    }
    
    getItemName(itemId) {
        if (!this.gameState || !this.gameState.shopItems) return itemId;
        
        for (const category of Object.values(this.gameState.shopItems)) {
            const item = category.find(i => i.id === itemId);
            if (item) return item.name;
        }
        
        return itemId;
    }
    
    getPlayerName(playerId) {
        if (!this.gameState || !this.gameState.players) return playerId;
        
        const player = this.gameState.players.find(p => p.id === playerId);
        return player ? player.name : playerId;
    }
    
    getTeamName(teamId) {
        if (!this.gameState || !this.gameState.teams) return teamId;
        
        const team = this.gameState.teams.find(t => t.id === teamId);
        return team ? `队伍 ${team.id}` : teamId;
    }
    
    getCommandText(commandType) {
        const commands = {
            '全员保护床': '🛡️ 全员保护床',
            '全员出击': '⚔️ 全员出击',
            '跟我走': '👣 跟我走'
        };
        return commands[commandType] || commandType;
    }
    
    getMyPlayer() {
        if (!this.gameState || !this.gameState.players) return null;
        return this.gameState.players.find(p => p.id === this.playerId);
    }
    
    updatePlayerInfo() {
        const myPlayer = this.getMyPlayer();
        if (!myPlayer) return;
        
        // 更新玩家信息
        const playerNameEl = document.getElementById('player-name');
        const playerTeamEl = document.getElementById('player-team');
        const playerHealthEl = document.getElementById('player-health');
        const playerKillsEl = document.getElementById('player-kills');
        
        if (playerNameEl) playerNameEl.textContent = myPlayer.name;
        if (playerTeamEl) {
            const team = this.gameState.teams.find(t => t.id === myPlayer.teamId);
            playerTeamEl.textContent = team ? team.id : '无';
            playerTeamEl.style.color = team ? team.color : '#fff';
        }
        if (playerHealthEl) playerHealthEl.textContent = Math.max(0, myPlayer.health);
        if (playerKillsEl) playerKillsEl.textContent = myPlayer.kills || 0;
    }
    
    updateResourceDisplay() {
        const myPlayer = this.getMyPlayer();
        if (!myPlayer || !myPlayer.resources) return;
        
        const resourceIronEl = document.getElementById('resource-iron');
        const resourceGoldEl = document.getElementById('resource-gold');
        const resourceDiamondEl = document.getElementById('resource-diamond');
        const resourceEmeraldEl = document.getElementById('resource-emerald');
        
        if (resourceIronEl) resourceIronEl.textContent = myPlayer.resources['铁锭'] || 0;
        if (resourceGoldEl) resourceGoldEl.textContent = myPlayer.resources['金锭'] || 0;
        if (resourceDiamondEl) resourceDiamondEl.textContent = myPlayer.resources['钻石'] || 0;
        if (resourceEmeraldEl) resourceEmeraldEl.textContent = myPlayer.resources['绿宝石'] || 0;
    }
    
    updatePlayerCount() {
        const currentPlayersEl = document.getElementById('current-players');
        if (currentPlayersEl && this.gameState) {
            currentPlayersEl.textContent = this.gameState.players ? this.gameState.players.length : 0;
        }
    }
    
    showMessage(message) {
        this.messageQueue.push(message);
        
        // 只保留最后5条消息
        if (this.messageQueue.length > 5) {
            this.messageQueue.shift();
        }
        
        // 更新击杀通知
        this.updateKillFeed();
    }
    
    updateKillFeed() {
        const killFeedEl = document.getElementById('kill-feed');
        if (!killFeedEl) return;
        
        killFeedEl.innerHTML = '';
        
        this.messageQueue.forEach((message, index) => {
            const itemEl = document.createElement('div');
            itemEl.className = 'kill-feed-item';
            itemEl.textContent = message;
            killFeedEl.appendChild(itemEl);
        });
    }
    
    showDamageText(targetId, damage) {
        if (!this.gameState || !this.gameState.players) return;
        
        const targetPlayer = this.gameState.players.find(p => p.id === targetId);
        if (!targetPlayer) return;
        
        this.damageTexts.push({
            x: targetPlayer.x,
            y: targetPlayer.y - 20,
            text: `-${damage}`,
            time: Date.now()
        });
        
        // 1秒后移除
        setTimeout(() => {
            this.damageTexts = this.damageTexts.filter(d => d.time !== Date.now());
        }, 1000);
    }
    
    showCollectEffect(resourceId, playerId) {
        if (!this.gameState) return;
        
        const resource = this.gameState.resources.find(r => r.id === resourceId);
        if (!resource) return;
        
        this.collectEffects.push({
            x: resource.x,
            y: resource.y,
            time: Date.now()
        });
        
        // 0.5秒后移除
        setTimeout(() => {
            this.collectEffects = this.collectEffects.filter(c => c.time !== Date.now());
        }, 500);
    }
    
    showStartScreen() {
        const startScreen = document.getElementById('start-screen');
        const waitingScreen = document.getElementById('waiting-screen');
        const endScreen = document.getElementById('end-screen');
        
        if (startScreen) startScreen.style.display = 'flex';
        if (waitingScreen) waitingScreen.classList.add('hidden');
        if (endScreen) endScreen.classList.add('hidden');
    }
    
    hideStartScreen() {
        const startScreen = document.getElementById('start-screen');
        if (startScreen) startScreen.style.display = 'none';
    }
    
    showWaitingScreen() {
        const waitingScreen = document.getElementById('waiting-screen');
        if (waitingScreen) waitingScreen.classList.remove('hidden');
    }
    
    hideWaitingScreen() {
        const waitingScreen = document.getElementById('waiting-screen');
        if (waitingScreen) waitingScreen.classList.add('hidden');
    }
    
    showEndScreen(winnerTeam) {
        const endScreen = document.getElementById('end-screen');
        const winnerText = document.getElementById('winner-text');
        const winnerDescription = document.getElementById('winner-description');
        
        if (endScreen) endScreen.classList.remove('hidden');
        if (winnerText) {
            if (winnerTeam) {
                const team = this.gameState.teams.find(t => t.id === winnerTeam);
                winnerText.textContent = `🏆 ${team ? team.id : winnerTeam} 获胜!`;
            } else {
                winnerText.textContent = '🏆 游戏结束';
            }
        }
        
        if (winnerDescription) {
            if (winnerTeam) {
                winnerDescription.textContent = '恭喜获胜队伍!';
            } else {
                winnerDescription.textContent = '平局!';
            }
        }
    }
    
    hideEndScreen() {
        const endScreen = document.getElementById('end-screen');
        if (endScreen) endScreen.classList.add('hidden');
    }
    
    // 游戏主循环
    startGameLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        const gameLoop = (timestamp) => {
            this.update(timestamp);
            this.render(timestamp);
            this.animationFrameId = requestAnimationFrame(gameLoop);
        };
        
        this.animationFrameId = requestAnimationFrame(gameLoop);
    }
    
    update(timestamp) {
        // 处理玩家移动
        this.handlePlayerMovement(timestamp);
        
        // 更新游戏状态
        if (this.gameState) {
            // 检查游戏是否结束
            if (this.gameState.state === 'ended') {
                this.showEndScreen(this.gameState.winnerTeam);
                return;
            }
            
            // 检查游戏是否开始
            if (this.gameState.state === 'playing') {
                this.hideWaitingScreen();
            }
            
            // 更新计时器
            this.updateTimer();
        }
    }
    
    handlePlayerMovement(timestamp) {
        if (!this.gameState || !this.gameState.players) return;
        
        const myPlayer = this.getMyPlayer();
        if (!myPlayer || myPlayer.isDead) return;
        
        const deltaTime = timestamp - this.lastUpdateTime;
        this.lastUpdateTime = timestamp;
        
        const speed = 2;
        const moveSpeed = speed * (deltaTime / 16); // 标准化到60fps
        
        let dx = 0;
        let dy = 0;
        
        // 处理键盘输入
        if (this.keys['w'] || this.keys['W'] || this.keys['ArrowUp']) {
            dy -= moveSpeed;
        }
        if (this.keys['s'] || this.keys['S'] || this.keys['ArrowDown']) {
            dy += moveSpeed;
        }
        if (this.keys['a'] || this.keys['A'] || this.keys['ArrowLeft']) {
            dx -= moveSpeed;
        }
        if (this.keys['d'] || this.keys['D'] || this.keys['ArrowRight']) {
            dx += moveSpeed;
        }
        
        // 计算新位置
        let newX = myPlayer.x + dx;
        let newY = myPlayer.y + dy;
        
        // 限制在画布边界内
        newX = Math.max(20, Math.min(this.canvas.width - 20, newX));
        newY = Math.max(20, Math.min(this.canvas.height - 20, newY));
        
        // 计算朝向
        let direction = myPlayer.direction || 0;
        if (dx !== 0 || dy !== 0) {
            direction = Math.atan2(dy, dx);
        }
        
        // 发送移动数据到服务器
        if (dx !== 0 || dy !== 0) {
            this.socket.emit('playerMove', {
                x: newX,
                y: newY,
                direction: direction
            });
        }
    }
    
    updateTimer() {
        if (!this.gameState || !this.gameState.startTime) return;
        
        const timerEl = document.getElementById('game-timer');
        if (!timerEl) return;
        
        const elapsed = Date.now() - this.gameState.startTime;
        const remaining = Math.max(0, this.gameState.config.gameDuration - elapsed);
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    render(timestamp) {
        if (!this.ctx || !this.gameState) return;
        
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制游戏背景
        this.drawBackground();
        
        // 绘制床
        if (this.gameState.beds) {
            this.gameState.beds.forEach(bed => this.drawBed(bed));
        }
        
        // 绘制资源
        if (this.gameState.resources) {
            this.gameState.resources.forEach(resource => {
                if (!resource.collected) {
                    this.drawResource(resource);
                }
            });
        }
        
        // 绘制投掷物
        if (this.gameState.projectiles) {
            this.gameState.projectiles.forEach(projectile => this.drawProjectile(projectile));
        }
        
        // 绘制玩家
        if (this.gameState.players) {
            this.gameState.players.forEach(player => this.drawPlayer(player));
        }
        
        // 绘制伤害数字
        this.damageTexts.forEach(damage => {
            this.drawDamageText(damage);
        });
        
        // 绘制收集效果
        this.collectEffects.forEach(effect => {
            this.drawCollectEffect(effect);
        });
    }
    
    drawBackground() {
        // 绘制渐变背景
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, '#0a0a15');
        gradient.addColorStop(1, '#1a1a2e');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 绘制网格线
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < this.canvas.width; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < this.canvas.height; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }
    
    drawBed(bed) {
        const team = this.gameState.teams.find(t => t.id === bed.teamId);
        const color = team ? team.color : '#888';
        
        // 绘制床
        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(bed.x - 20, bed.y - 10, 40, 20);
        
        // 床头
        this.ctx.fillStyle = '#A0522D';
        this.ctx.fillRect(bed.x - 25, bed.y - 15, 50, 10);
        
        // 床边框
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bed.x - 20, bed.y - 10, 40, 20);
        
        // 显示床的健康值
        if (bed.health < bed.maxHealth) {
            this.ctx.fillStyle = '#ff4444';
            this.ctx.fillRect(bed.x - 15, bed.y - 25, 30 * (bed.health / bed.maxHealth), 5);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(bed.x - 15, bed.y - 25, 30, 5);
        }
        
        // 显示队伍标识
        this.ctx.fillStyle = color;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(bed.teamId, bed.x, bed.y + 25);
    }
    
    drawResource(resource) {
        const resourceType = this.gameState.resourceTypes[resource.type];
        if (!resourceType) return;
        
        // 绘制资源图标
        this.ctx.fillStyle = resourceType.color;
        this.ctx.beginPath();
        this.ctx.arc(resource.x, resource.y, 10, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制边框
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        
        // 绘制资源图标
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#fff';
        
        // 使用emoji表示不同资源
        let icon = '';
        switch (resource.type) {
            case 'IRON': icon = '🪨'; break;
            case 'GOLD': icon = '🟡'; break;
            case 'DIAMOND': icon = '🔵'; break;
            case 'EMERALD': icon = '🟢'; break;
        }
        
        this.ctx.fillText(icon, resource.x, resource.y);
    }
    
    drawPlayer(player) {
        const team = this.gameState.teams.find(t => t.id === player.teamId);
        const color = team ? team.color : '#888';
        
        // 绘制玩家身体
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y, 15, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制玩家头部
        this.ctx.fillStyle = '#FFD7A5';
        this.ctx.beginPath();
        this.ctx.arc(player.x, player.y - 5, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        // 绘制玩家朝向指示
        if (player.direction) {
            const arrowX = player.x + Math.cos(player.direction) * 12;
            const arrowY = player.y + Math.sin(player.direction) * 12;
            
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(player.x, player.y);
            this.ctx.lineTo(arrowX, arrowY);
            this.ctx.stroke();
        }
        
        // 绘制健康值
        if (player.health < player.maxHealth) {
            const healthWidth = 30 * (player.health / player.maxHealth);
            this.ctx.fillStyle = '#ff4444';
            this.ctx.fillRect(player.x - 15, player.y - 25, healthWidth, 5);
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(player.x - 15, player.y - 25, 30, 5);
        }
        
        // 绘制玩家名称
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(player.name, player.x, player.y + 25);
        
        // 如果是自己，绘制特殊标记
        if (player.id === this.playerId) {
            this.ctx.strokeStyle = '#ffd700';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(player.x, player.y, 18, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        
        // 如果玩家死亡，绘制墓碑
        if (player.isDead) {
            this.ctx.fillStyle = '#333';
            this.ctx.font = '20px Arial';
            this.ctx.fillText('⚰️', player.x - 10, player.y - 10);
        }
        
        // 绘制武器
        if (player.weapon) {
            const weaponX = player.x + Math.cos(player.direction || 0) * 20;
            const weaponY = player.y + Math.sin(player.direction || 0) * 20;
            
            this.ctx.font = '16px Arial';
            this.ctx.fillText('⚔️', weaponX, weaponY);
        }
    }
    
    drawProjectile(projectile) {
        // 绘制投掷物
        this.ctx.fillStyle = projectile.type === 'tnt' ? '#ff4444' : '#ff8800';
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 8, 0, Math.PI * 2);
        this.ctx.fill();
        
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();
        
        // 绘制投掷物图标
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(projectile.type === 'tnt' ? '💣' : '🔥', projectile.x, projectile.y);
    }
    
    drawDamageText(damage) {
        this.ctx.font = '16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillText(damage.text, damage.x, damage.y);
    }
    
    drawCollectEffect(effect) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.ctx.beginPath();
        this.ctx.arc(effect.x, effect.y, 10, 0, Math.PI * 2);
        this.ctx.fill();
    }
}

// 初始化游戏
let gameClient;

window.addEventListener('load', () => {
    gameClient = new GameClient();
    gameClient.startGameLoop();
});

// 处理窗口关闭
window.addEventListener('beforeunload', () => {
    if (gameClient && gameClient.socket) {
        gameClient.socket.disconnect();
    }
});
