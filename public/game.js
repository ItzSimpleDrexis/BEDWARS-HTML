// 游戏客户端主逻辑
class BedWarsGame {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.player = null;
        this.gameState = {
            players: [],
            teams: [],
            beds: [],
            resources: [],
            shops: [],
            projectiles: []
        };
        this.keys = {};
        this.mouse = { x: 0, y: 0 };
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.lastUpdateTime = 0;
        this.animationFrameId = null;
        this.selectedShop = null;
        this.teamCommands = ['defend_bed', 'attack', 'follow'];
        
        // 游戏状态
        this.isDead = false;
        this.respawnTime = 0;
        this.gameEnded = false;
        
        // 初始化
        this.init();
    }
    
    init() {
        // 获取DOM元素
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // 设置画布大小
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // 绑定事件
        this.bindEvents();
        
        // 连接Socket.io
        this.connectSocket();
        
        // 显示登录界面
        this.showLoginScreen();
    }
    
    resizeCanvas() {
        const container = document.getElementById('game-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }
    
    bindEvents() {
        // 键盘事件
        document.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            
            // 处理特殊按键
            if (e.code === 'KeyE') {
                this.toggleShop();
            }
            
            if (e.code === 'KeyF') {
                this.openTeamCommands();
            }
            
            if (e.code === 'KeyR' && this.isDead) {
                this.requestRespawn();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // 鼠标事件
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });
        
        this.canvas.addEventListener('click', (e) => {
            this.handleCanvasClick(e);
        });
        
        // 登录按钮
        document.getElementById('start-game').addEventListener('click', () => {
            this.startGame();
        });
        
        // 关闭商店
        document.getElementById('close-shop').addEventListener('click', () => {
            this.closeShop();
        });
        
        // 关闭指令界面
        document.getElementById('close-command').addEventListener('click', () => {
            this.closeTeamCommands();
        });
        
        // 团队指令按钮
        document.querySelectorAll('.command-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const command = btn.dataset.command;
                this.sendTeamCommand(command);
                this.closeTeamCommands();
            });
        });
        
        // 返回大厅
        document.getElementById('return-to-lobby').addEventListener('click', () => {
            this.returnToLobby();
        });
    }
    
    connectSocket() {
        this.socket = io();
        
        // 连接事件
        this.socket.on('connect', () => {
            console.log('Connected to server');
        });
        
        // 玩家加入
        this.socket.on('player_joined', (data) => {
            this.player = { id: data.playerId };
        });
        
        // 游戏状态更新
        this.socket.on('game_update', (gameState) => {
            this.gameState = gameState;
            this.updatePlayerState();
        });
        
        // 攻击结果
        this.socket.on('attack_result', (data) => {
            this.showMessage(`击中目标，造成 ${data.damage} 点伤害!`, 'kill');
        });
        
        // 资源收集
        this.socket.on('resource_collected', (data) => {
            this.showMessage(`收集了 ${data.value} ${this.getResourceName(data.type)}`, 'resource');
        });
        
        // 物品购买
        this.socket.on('item_purchased', (data) => {
            this.showMessage(`购买了 ${data.itemName}`, 'resource');
        });
        
        // 购买失败
        this.socket.on('buy_failed', (data) => {
            this.showMessage(data.message, 'team');
        });
        
        // 床受损
        this.socket.on('bed_damaged', (data) => {
            if (data.destroyed) {
                this.showMessage('敌人的床被破坏了!', 'kill');
            }
        });
        
        // 团队指令接收
        this.socket.on('team_command_received', (data) => {
            this.showMessage(`${data.playerName} 发出指令: ${this.getCommandName(data.command)}`, 'team');
        });
        
        // 游戏结束
        this.socket.on('game_end', (data) => {
            this.gameEnded = true;
            this.showGameEndScreen(data.winner);
        });
    }
    
    showLoginScreen() {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('game-screen').style.display = 'none';
    }
    
    showGameScreen() {
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
    }
    
    startGame() {
        const playerName = document.getElementById('player-name').value.trim();
        if (!playerName) {
            alert('请输入你的名字');
            return;
        }
        
        this.socket.emit('join_game', { name: playerName });
        this.showGameScreen();
        
        // 开始游戏循环
        this.lastUpdateTime = performance.now();
        this.gameLoop();
    }
    
    returnToLobby() {
        this.gameEnded = false;
        this.isDead = false;
        this.gameState = {
            players: [],
            teams: [],
            beds: [],
            resources: [],
            shops: [],
            projectiles: []
        };
        
        // 重置UI
        document.getElementById('death-screen').classList.remove('active');
        document.getElementById('game-end-screen').classList.remove('active');
        document.getElementById('shop-modal').classList.remove('active');
        document.getElementById('team-command-modal').classList.remove('active');
        
        this.showLoginScreen();
        
        // 取消游戏循环
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    gameLoop() {
        const now = performance.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        
        // 更新游戏状态
        this.update(deltaTime);
        
        // 渲染
        this.render();
        
        // 继续循环
        if (!this.gameEnded) {
            this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
        }
    }
    
    update(deltaTime) {
        if (!this.player || this.gameEnded) return;
        
        // 处理玩家移动
        this.handlePlayerMovement(deltaTime);
        
        // 更新相机
        this.updateCamera();
        
        // 检查死亡状态
        this.checkDeathStatus();
        
        // 更新UI
        this.updateUI();
    }
    
    handlePlayerMovement(deltaTime) {
        if (this.isDead) return;
        
        const player = this.gameState.players.find(p => p.id === this.socket.id);
        if (!player || !player.isAlive) return;
        
        const speed = 5;
        let moveX = 0;
        let moveY = 0;
        
        // WASD 或 箭头键
        if (this.keys['KeyW'] || this.keys['ArrowUp']) moveY -= speed;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) moveY += speed;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= speed;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += speed;
        
        // 归一化移动向量
        const length = Math.sqrt(moveX * moveX + moveY * moveY);
        if (length > 0) {
            moveX = (moveX / length) * speed;
            moveY = (moveY / length) * speed;
        }
        
        // 计算新位置
        const newX = player.x + moveX * deltaTime * 60;
        const newY = player.y + moveY * deltaTime * 60;
        
        // 发送移动数据到服务器
        if (moveX !== 0 || moveY !== 0) {
            this.socket.emit('player_move', {
                x: newX,
                y: newY
            });
        }
    }
    
    updateCamera() {
        const player = this.gameState.players.find(p => p.id === this.socket.id);
        if (player) {
            this.camera.x = player.x - this.canvas.width / 2 / this.camera.zoom;
            this.camera.y = player.y - this.canvas.height / 2 / this.camera.zoom;
        }
    }
    
    checkDeathStatus() {
        const player = this.gameState.players.find(p => p.id === this.socket.id);
        if (player && !player.isAlive) {
            this.isDead = true;
            document.getElementById('death-screen').classList.add('active');
        } else if (this.isDead) {
            this.isDead = false;
            document.getElementById('death-screen').classList.remove('active');
        }
    }
    
    updatePlayerState() {
        const player = this.gameState.players.find(p => p.id === this.socket.id);
        if (player) {
            this.player = player;
            
            // 更新生命值
            const healthPercent = (player.health / player.maxHealth) * 100;
            document.getElementById('health-bar').style.width = `${healthPercent}%`;
            document.getElementById('health-value').textContent = `${player.health}/${player.maxHealth}`;
            
            // 更新资源
            document.getElementById('iron-count').textContent = player.inventory.iron;
            document.getElementById('gold-count').textContent = player.inventory.gold;
            document.getElementById('diamond-count').textContent = player.inventory.diamond;
            document.getElementById('emerald-count').textContent = player.inventory.emerald;
            
            // 更新队伍信息
            const team = this.gameState.teams.find(t => t.id === player.teamId);
            if (team) {
                document.getElementById('team-name').textContent = team.name;
                document.getElementById('team-name').className = `team-${team.color}`;
            }
        }
    }
    
    updateUI() {
        // 更新计时器
        const timeRemaining = this.gameState.timeRemaining || 300;
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = Math.floor(timeRemaining % 60);
        document.getElementById('game-timer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        
        // 更新重生计时器
        if (this.isDead) {
            const respawnTime = this.gameState.players.find(p => p.id === this.socket.id)?.respawnTime;
            if (respawnTime) {
                const timeLeft = Math.max(0, (respawnTime - Date.now()) / 1000);
                document.getElementById('respawn-timer').textContent = Math.ceil(timeLeft);
            }
        }
    }
    
    render() {
        // 清空画布
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 保存上下文
        this.ctx.save();
        
        // 应用相机变换
        this.ctx.translate(-this.camera.x * this.camera.zoom, -this.camera.y * this.camera.zoom);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        
        // 绘制游戏地图
        this.drawMap();
        
        // 绘制资源
        this.drawResources();
        
        // 绘制床
        this.drawBeds();
        
        // 绘制商店
        this.drawShops();
        
        // 绘制玩家
        this.drawPlayers();
        
        // 恢复上下文
        this.ctx.restore();
        
        // 绘制UI元素
        this.drawUI();
    }
    
    drawMap() {
        // 绘制背景网格
        const gridSize = 20;
        const width = this.canvas.width / this.camera.zoom;
        const height = this.canvas.height / this.camera.zoom;
        
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 1;
        
        for (let x = 0; x < width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y < height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        // 绘制边界
        this.ctx.strokeStyle = '#4a4a6a';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(0, 0, 100, 100);
    }
    
    drawResources() {
        this.gameState.resources.forEach(resource => {
            const x = resource.x;
            const y = resource.y;
            
            // 根据资源类型选择颜色
            let color, icon;
            switch(resource.type) {
                case 'iron':
                    color = '#a0a0a0';
                    icon = '🟫';
                    break;
                case 'gold':
                    color = '#ffd700';
                    icon = '🟡';
                    break;
                case 'diamond':
                    color = '#00bfff';
                    icon = '🔵';
                    break;
                case 'emerald':
                    color = '#50c878';
                    icon = '🟢';
                    break;
                default:
                    color = '#ffffff';
                    icon = '?';
            }
            
            // 绘制资源
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制图标
            this.ctx.font = '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(icon, x, y);
        });
    }
    
    drawBeds() {
        this.gameState.beds.forEach(bed => {
            const team = this.gameState.teams.find(t => t.id === bed.teamId);
            if (!team) return;
            
            const x = bed.x;
            const y = bed.y;
            const size = 15;
            
            // 绘制床
            this.ctx.fillStyle = team.color;
            this.ctx.fillRect(x - size/2, y - size/2, size, size);
            
            // 绘制床的健康值
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - size/2, y - size/2, size, size);
            
            // 绘制健康条
            const healthPercent = bed.health / bed.maxHealth;
            this.ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : healthPercent > 0.25 ? '#ffeb3b' : '#ff4757';
            this.ctx.fillRect(x - size/2, y - size/2 - 5, size * healthPercent, 3);
            
            // 如果床被破坏
            if (bed.health <= 0) {
                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                this.ctx.fillRect(x - size/2, y - size/2, size, size);
                this.ctx.strokeStyle = '#ff0000';
                this.ctx.lineWidth = 3;
                this.ctx.strokeRect(x - size/2, y - size/2, size, size);
            }
        });
    }
    
    drawShops() {
        this.gameState.shops.forEach(shop => {
            const team = this.gameState.teams.find(t => t.id === shop.teamId);
            if (!team) return;
            
            const x = shop.x;
            const y = shop.y;
            const size = 12;
            
            // 绘制商店
            this.ctx.fillStyle = '#8b4513';
            this.ctx.fillRect(x - size/2, y - size/2, size, size);
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(x - size/2, y - size/2, size, size);
            
            // 绘制商店图标
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🏪', x, y);
        });
    }
    
    drawPlayers() {
        this.gameState.players.forEach(player => {
            const team = this.gameState.teams.find(t => t.id === player.teamId);
            if (!team) return;
            
            const x = player.x;
            const y = player.y;
            const radius = player.isAI ? 6 : 8;
            
            // 绘制玩家
            this.ctx.fillStyle = team.color;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = player.isAlive ? '#fff' : '#ff0000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // 绘制健康条
            if (player.isAlive) {
                const healthPercent = player.health / player.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#4caf50' : healthPercent > 0.25 ? '#ffeb3b' : '#ff4757';
                this.ctx.fillRect(x - radius, y - radius - 8, radius * 2 * healthPercent, 3);
            }
            
            // 绘制玩家名称
            this.ctx.font = player.isAI ? '10px Arial' : '12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            this.ctx.fillStyle = '#fff';
            this.ctx.fillText(player.name, x, y - radius - 12);
            
            // 如果是AI，显示行为
            if (player.isAI && player.action) {
                this.ctx.font = '8px Arial';
                this.ctx.fillStyle = '#a0a0b0';
                this.ctx.fillText(this.getActionName(player.action), x, y + radius + 5);
            }
            
            // 如果是当前玩家，绘制光环
            if (player.id === this.socket.id) {
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        });
    }
    
    drawUI() {
        // 绘制准星
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        
        this.ctx.strokeStyle = '#ffd700';
        this.ctx.lineWidth = 2;
        
        // 水平线
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - 15, centerY);
        this.ctx.lineTo(centerX + 15, centerY);
        this.ctx.stroke();
        
        // 垂直线
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, centerY - 15);
        this.ctx.lineTo(centerX, centerY + 15);
        this.ctx.stroke();
    }
    
    handleCanvasClick(e) {
        if (this.isDead || this.gameEnded) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // 计算世界坐标
        const worldX = (mouseX / this.camera.zoom) + this.camera.x;
        const worldY = (mouseY / this.camera.zoom) + this.camera.y;
        
        // 检查是否点击了玩家
        const clickedPlayer = this.gameState.players.find(p => {
            const dx = worldX - p.x;
            const dy = worldY - p.y;
            return Math.sqrt(dx * dx + dy * dy) < 10;
        });
        
        if (clickedPlayer && clickedPlayer.teamId !== this.player?.teamId && clickedPlayer.isAlive) {
            // 攻击玩家
            this.socket.emit('player_attack', {
                targetId: clickedPlayer.id
            });
        }
        
        // 检查是否点击了床
        const clickedBed = this.gameState.beds.find(bed => {
            const dx = worldX - bed.x;
            const dy = worldY - bed.y;
            return Math.sqrt(dx * dx + dy * dy) < 15;
        });
        
        if (clickedBed && clickedBed.teamId !== this.player?.teamId) {
            // 破坏床
            this.socket.emit('destroy_bed', {
                bedId: clickedBed.id
            });
        }
        
        // 检查是否点击了资源
        const clickedResource = this.gameState.resources.find(resource => {
            const dx = worldX - resource.x;
            const dy = worldY - resource.y;
            return Math.sqrt(dx * dx + dy * dy) < 10;
        });
        
        if (clickedResource) {
            // 收集资源
            this.socket.emit('collect_resource', {
                resourceId: clickedResource.id
            });
        }
        
        // 检查是否点击了商店
        const clickedShop = this.gameState.shops.find(shop => {
            const dx = worldX - shop.x;
            const dy = worldY - shop.y;
            return Math.sqrt(dx * dx + dy * dy) < 15;
        });
        
        if (clickedShop && clickedShop.teamId === this.player?.teamId) {
            this.selectedShop = clickedShop;
            this.openShop();
        }
    }
    
    toggleShop() {
        if (document.getElementById('shop-modal').classList.contains('active')) {
            this.closeShop();
        } else {
            // 检查是否在商店附近
            const player = this.gameState.players.find(p => p.id === this.socket.id);
            if (player) {
                const shop = this.gameState.shops.find(s => s.teamId === player.teamId);
                if (shop) {
                    const dx = player.x - shop.x;
                    const dy = player.y - shop.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    
                    if (distance < 20) {
                        this.selectedShop = shop;
                        this.openShop();
                    } else {
                        this.showMessage('你需要靠近商店才能购买物品', 'team');
                    }
                }
            }
        }
    }
    
    openShop() {
        if (!this.selectedShop) return;
        
        const shopItemsContainer = document.getElementById('shop-items');
        shopItemsContainer.innerHTML = '';
        
        this.selectedShop.items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'shop-item';
            itemElement.innerHTML = `
                <div class="item-icon">${this.getItemIcon(item.id)}</div>
                <div class="item-name">${item.name}</div>
                <div class="item-cost">${this.formatCost(item.cost)}</div>
            `;
            
            itemElement.addEventListener('click', () => {
                this.buyItem(item.id);
            });
            
            shopItemsContainer.appendChild(itemElement);
        });
        
        document.getElementById('shop-modal').classList.add('active');
    }
    
    closeShop() {
        document.getElementById('shop-modal').classList.remove('active');
        this.selectedShop = null;
    }
    
    buyItem(itemId) {
        this.socket.emit('buy_item', {
            itemId: itemId
        });
    }
    
    openTeamCommands() {
        document.getElementById('team-command-modal').classList.add('active');
    }
    
    closeTeamCommands() {
        document.getElementById('team-command-modal').classList.remove('active');
    }
    
    sendTeamCommand(command) {
        this.socket.emit('team_command', {
            command: command
        });
        this.showMessage(`发送指令: ${this.getCommandName(command)}`, 'team');
    }
    
    requestRespawn() {
        // 立即重生请求
        this.socket.emit('player_move', {
            x: this.player?.x || 0,
            y: this.player?.y || 0
        });
    }
    
    showGameEndScreen(winner) {
        const resultElement = document.getElementById('game-result');
        const scoresElement = document.getElementById('final-scores');
        
        if (winner) {
            const winningTeam = this.gameState.teams.find(t => t.id === winner);
            if (winningTeam) {
                resultElement.textContent = `${winningTeam.name} 队伍获胜!`;
                resultElement.className = 'win';
            } else {
                resultElement.textContent = '游戏结束';
            }
        } else {
            resultElement.textContent = '游戏结束';
        }
        
        // 显示分数
        scoresElement.innerHTML = '<h3>最终分数</h3>';
        this.gameState.teams.forEach(team => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'score-item';
            scoreItem.innerHTML = `
                <span style="color: ${team.color}">${team.name}</span>
                <span>${team.score} 分</span>
            `;
            scoresElement.appendChild(scoreItem);
        });
        
        document.getElementById('game-end-screen').classList.add('active');
    }
    
    showMessage(message, type = 'default') {
        const messagesContainer = document.getElementById('game-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${type}`;
        messageElement.textContent = message;
        
        messagesContainer.appendChild(messageElement);
        
        // 限制消息数量
        while (messagesContainer.children.length > 5) {
            messagesContainer.removeChild(messagesContainer.firstChild);
        }
        
        // 自动删除消息
        setTimeout(() => {
            messageElement.remove();
        }, 5000);
    }
    
    getResourceName(type) {
        const names = {
            iron: '铁锭',
            gold: '金锭',
            diamond: '钻石',
            emerald: '绿宝石'
        };
        return names[type] || type;
    }
    
    getItemIcon(itemId) {
        const icons = {
            sword: '⚔️',
            bow: '🏹',
            leather_armor: '👕',
            iron_armor: '🛡️',
            gold_armor: '👑',
            diamond_armor: '✨',
            block: '⬜',
            tnt: '💣'
        };
        return icons[itemId] || '?';
    }
    
    formatCost(cost) {
        let result = '';
        for (const [resource, amount] of Object.entries(cost)) {
            result += `${this.getResourceIcon(resource)}${amount} `;
        }
        return result.trim();
    }
    
    getResourceIcon(type) {
        const icons = {
            iron: '🟫',
            gold: '🟡',
            diamond: '🔵',
            emerald: '🟢'
        };
        return icons[type] || '?';
    }
    
    getActionName(action) {
        const names = {
            defend: '守卫',
            attack: '攻击',
            collect: '收集',
            follow: '跟随',
            panic: '慌乱',
            idle: '待命'
        };
        return names[action] || action;
    }
    
    getCommandName(command) {
        const names = {
            defend_bed: '全员保护床',
            attack: '全员出击',
            follow: '跟我走'
        };
        return names[command] || command;
    }
}

// 启动游戏
document.addEventListener('DOMContentLoaded', () => {
    window.game = new BedWarsGame();
});
