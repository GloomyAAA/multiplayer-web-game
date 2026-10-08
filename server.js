const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 8080;

// 中间件配置 - 必须在路由之前
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 路由配置 - 明确指向HTML文件
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'about.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/game.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

app.get('/report.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'report.html'));
});

// ============ 游戏逻辑 ============
const SHAPES = ['circle', 'square', 'triangle', 'star'];
const COLORS = ['pink', 'purple', 'green', 'blue'];

// 生成16个唯一方块
function generateAllBlocks() {
    const blocks = [];
    for (let i = 0; i < SHAPES.length; i++) {
        for (let j = 0; j < COLORS.length; j++) {
            blocks.push({
                id: `${SHAPES[i]}_${COLORS[j]}`,
                shape: SHAPES[i],
                color: COLORS[j]
            });
        }
    }
    return blocks;
}

// 洗牌函数
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 游戏类
class GameState {
    constructor() {
        this.resetGame();
    }

    resetGame() {
        this.grid = Array(4).fill().map(() => Array(4).fill(null));
        this.pool = shuffleArray(generateAllBlocks());
        this.players = [];
        this.scores = {};
        this.currentPlayerIndex = 0;
        this.turnTimeout = null;
        this.TURN_TIMEOUT_MS = 60000;
    }

    getCurrentPlayer() {
        if (this.players.length === 0) return null;
        return this.players[this.currentPlayerIndex];
    }

    addPlayer(playerId, playerName) {
        if (this.players.some(p => p.name === playerName)) {
            return false;
        }
        this.players.push({ id: playerId, name: playerName });
        this.scores[playerId] = 0;
        return true;
    }

    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index === -1) return false;
        
        this.players.splice(index, 1);
        delete this.scores[playerId];
        
        if (this.players.length === 0) {
            this.currentPlayerIndex = 0;
            this.resetGame();
        } else if (index < this.currentPlayerIndex) {
            this.currentPlayerIndex--;
        } else if (index === this.currentPlayerIndex) {
            this.currentPlayerIndex = this.currentPlayerIndex % this.players.length;
        }
        return true;
    }

    getRandomBlockForPlayer() {
        if (this.pool.length === 0) return null;
        const randomIndex = Math.floor(Math.random() * this.pool.length);
        return { ...this.pool[randomIndex] };
    }

    removeBlockFromPool(block) {
        const index = this.pool.findIndex(b => b.id === block.id);
        if (index !== -1) {
            this.pool.splice(index, 1);
            return true;
        }
        return false;
    }

    addBlockToPool(block) {
        this.pool.push(block);
    }

    placeBlock(row, col, block, playerId) {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer || currentPlayer.id !== playerId) {
            return { success: false, error: 'Not your turn' };
        }
        if (this.grid[row][col] !== null) {
            return { success: false, error: 'Position already occupied' };
        }
        if (!block) {
            return { success: false, error: 'No block available' };
        }

        this.grid[row][col] = block;
        this.removeBlockFromPool(block);
        
        let pointsEarned = 0;
        
        const result = this.checkAndClearLines();
        pointsEarned += result.points;
        
        const isFull = this.isGridFull();
        if (isFull) {
            for (let r = 0; r < 4; r++) {
                for (let c = 0; c < 4; c++) {
                    if (this.grid[r][c] !== null) {
                        this.addBlockToPool(this.grid[r][c]);
                        this.grid[r][c] = null;
                    }
                }
            }
            pointsEarned += 16;
            this.scores[playerId] += 16;
            
            this.nextTurn();
            
            return {
                success: true,
                pointsEarned: 16,
                isFullClear: true
            };
        }
        
        if (pointsEarned > 0) {
            this.scores[playerId] += pointsEarned;
        }
        
        this.nextTurn();
        
        return {
            success: true,
            pointsEarned: pointsEarned,
            isFullClear: false
        };
    }

    // 检查并清除所有连线（包括所有斜线）
    checkAndClearLines() {
        const blocksToClear = new Set();
        
        // 1. 检查所有水平线
        for (let r = 0; r < 4; r++) {
            const line = [];
            for (let c = 0; c < 4; c++) {
                if (this.grid[r][c] !== null) {
                    line.push({ block: this.grid[r][c], row: r, col: c });
                } else {
                    this.checkAndAddGroups(line, blocksToClear);
                    line.length = 0;
                }
            }
            this.checkAndAddGroups(line, blocksToClear);
        }
        
        // 2. 检查所有垂直线
        for (let c = 0; c < 4; c++) {
            const line = [];
            for (let r = 0; r < 4; r++) {
                if (this.grid[r][c] !== null) {
                    line.push({ block: this.grid[r][c], row: r, col: c });
                } else {
                    this.checkAndAddGroups(line, blocksToClear);
                    line.length = 0;
                }
            }
            this.checkAndAddGroups(line, blocksToClear);
        }
        
        // 3. 检查所有对角线（左上到右下方向）
        // 起始点: (0,0), (0,1), (0,2), (1,0), (2,0)
        const diagStarts1 = [[0,0], [0,1], [0,2], [1,0], [2,0]];
        for (const [sr, sc] of diagStarts1) {
            const line = [];
            let r = sr, c = sc;
            while (r < 4 && c < 4) {
                if (this.grid[r][c] !== null) {
                    line.push({ block: this.grid[r][c], row: r, col: c });
                } else {
                    this.checkAndAddGroups(line, blocksToClear);
                    line.length = 0;
                }
                r++;
                c++;
            }
            this.checkAndAddGroups(line, blocksToClear);
        }
        
        // 4. 检查所有对角线（右上到左下方向）
        // 起始点: (0,3), (0,2), (0,1), (1,3), (2,3)
        const diagStarts2 = [[0,3], [0,2], [0,1], [1,3], [2,3]];
        for (const [sr, sc] of diagStarts2) {
            const line = [];
            let r = sr, c = sc;
            while (r < 4 && c >= 0) {
                if (this.grid[r][c] !== null) {
                    line.push({ block: this.grid[r][c], row: r, col: c });
                } else {
                    this.checkAndAddGroups(line, blocksToClear);
                    line.length = 0;
                }
                r++;
                c--;
            }
            this.checkAndAddGroups(line, blocksToClear);
        }
        
        // 清除标记的方块并计分
        let points = 0;
        for (const cell of blocksToClear) {
            if (this.grid[cell.row][cell.col] !== null) {
                this.addBlockToPool(this.grid[cell.row][cell.col]);
                this.grid[cell.row][cell.col] = null;
                points++;
            }
        }
        
        return { points };
    }

    // 辅助方法：检查一组连续方块并添加到清除集合
    checkAndAddGroups(line, blocksToClear) {
        if (line.length < 3) return;
        
        // 按形状分组检查
        let shapeGroup = [];
        for (let i = 0; i <= line.length; i++) {
            if (i < line.length && (shapeGroup.length === 0 || shapeGroup[0].block.shape === line[i].block.shape)) {
                shapeGroup.push(line[i]);
            } else {
                if (shapeGroup.length >= 3) {
                    shapeGroup.forEach(cell => blocksToClear.add(cell));
                }
                shapeGroup = i < line.length ? [line[i]] : [];
            }
        }
        
        // 按颜色分组检查
        let colorGroup = [];
        for (let i = 0; i <= line.length; i++) {
            if (i < line.length && (colorGroup.length === 0 || colorGroup[0].block.color === line[i].block.color)) {
                colorGroup.push(line[i]);
            } else {
                if (colorGroup.length >= 3) {
                    colorGroup.forEach(cell => blocksToClear.add(cell));
                }
                colorGroup = i < line.length ? [line[i]] : [];
            }
        }
    }

    isGridFull() {
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                if (this.grid[r][c] === null) return false;
            }
        }
        return true;
    }

    nextTurn() {
        if (this.players.length === 0) return;
        
        if (this.turnTimeout) {
            clearTimeout(this.turnTimeout);
        }
        
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        
        this.turnTimeout = setTimeout(() => {
            if (this.players.length > 0) {
                const currentPlayer = this.getCurrentPlayer();
                if (currentPlayer) {
                    io.emit('turn_timeout', { playerId: currentPlayer.id, playerName: currentPlayer.name });
                    this.nextTurn();
                    io.emit('turn_changed', {
                        currentPlayer: this.getCurrentPlayer(),
                        players: this.players,
                        scores: this.scores
                    });
                }
            }
        }, this.TURN_TIMEOUT_MS);
    }

    getGameState() {
        return {
            grid: JSON.parse(JSON.stringify(this.grid)),
            players: [...this.players],
            scores: { ...this.scores },
            currentPlayer: this.getCurrentPlayer(),
            poolSize: this.pool.length
        };
    }
}

const gameState = new GameState();

// Socket.IO连接处理
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    let currentPlayerName = null;
    
    socket.on('register_player', (playerName, callback) => {
        console.log(`Player registering: ${playerName}`);
        if (gameState.addPlayer(socket.id, playerName)) {
            currentPlayerName = playerName;
            callback({ success: true });
            
            io.emit('players_update', {
                players: gameState.players,
                scores: gameState.scores,
                currentPlayer: gameState.getCurrentPlayer()
            });
            
            socket.emit('game_state', gameState.getGameState());
            console.log(`Player ${playerName} joined. Total players: ${gameState.players.length}`);
        } else {
            callback({ success: false, error: 'Name already taken or invalid' });
        }
    });
    
    socket.on('get_current_block', (callback) => {
        const currentPlayer = gameState.getCurrentPlayer();
        if (currentPlayer && currentPlayer.id === socket.id) {
            const block = gameState.getRandomBlockForPlayer();
            if (block) {
                callback({ success: true, block });
            } else {
                callback({ success: false, error: 'No blocks available' });
            }
        } else {
            callback({ success: false, error: 'Not your turn' });
        }
    });
    
    socket.on('place_block', (data, callback) => {
        const { row, col, block } = data;
        const result = gameState.placeBlock(row, col, block, socket.id);
        
        if (result.success) {
            io.emit('game_update', {
                grid: gameState.grid,
                players: gameState.players,
                scores: gameState.scores,
                currentPlayer: gameState.getCurrentPlayer(),
                poolSize: gameState.pool.length,
                lastPlacement: {
                    playerId: socket.id,
                    playerName: currentPlayerName,
                    row, col,
                    pointsEarned: result.pointsEarned,
                    isFullClear: result.isFullClear
                }
            });
            
            callback({ success: true, pointsEarned: result.pointsEarned });
        } else {
            callback({ success: false, error: result.error });
        }
    });
    
    socket.on('check_turn', (callback) => {
        const currentPlayer = gameState.getCurrentPlayer();
        callback({
            isMyTurn: currentPlayer?.id === socket.id,
            currentPlayer: currentPlayer
        });
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id, currentPlayerName);
        if (gameState.removePlayer(socket.id)) {
            io.emit('players_update', {
                players: gameState.players,
                scores: gameState.scores,
                currentPlayer: gameState.getCurrentPlayer()
            });
            console.log(`Player ${currentPlayerName} removed. Remaining players: ${gameState.players.length}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`========================================`);
    console.log(`Pages available:`);
    console.log(`  - Home:  http://localhost:${PORT}/`);
    console.log(`  - About: http://localhost:${PORT}/about`);
    console.log(`  - Game:  http://localhost:${PORT}/game`);
    console.log(`  - Report: http://localhost:${PORT}/report.html`);
    console.log(`========================================`);
});
