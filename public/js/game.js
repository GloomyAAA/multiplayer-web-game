// 等待页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    const socket = io();
    
    let currentPlayerId = null;
    let currentPlayerName = null;
    let currentBlock = null;
    let myTurn = false;
    let gameGrid = null;
    let countdownInterval = null;
    
    // 形状对应的图标 - 确保与服务器端一致
    const shapeIcon = {
        'circle': '<i class="fa-regular fa-circle"></i>',
        'square': '<i class="fa-regular fa-square"></i>',
        'triangle': '<i class="fa-solid fa-play" style="transform: rotate(90deg);"></i>',
        'star': '<i class="fa-regular fa-star"></i>'
    };
    
    // DOM 元素
    const registrationArea = document.getElementById('registration-area');
    const gameStatusDiv = document.getElementById('game-status');
    const joinBtn = document.getElementById('join-btn');
    const playerNameInput = document.getElementById('player-name');
    const currentPlayerNameSpan = document.getElementById('current-player-name');
    const turnIndicator = document.getElementById('turn-indicator');
    const currentBlockArea = document.getElementById('current-block-area');
    const currentBlockDiv = document.getElementById('current-block');
    const scoreList = document.getElementById('score-list');
    const playersOrderList = document.getElementById('players-order');
    const poolSizeSpan = document.getElementById('pool-size');
    const gameStatusText = document.getElementById('game-status-text');
    const gameMessageDiv = document.getElementById('game-message');
    const gameBoard = document.getElementById('game-board');
    const countdownTimer = document.getElementById('countdown-timer');
    const timerSecondsSpan = document.getElementById('timer-seconds');
    
    // 停止倒计时
    function stopCountdown() {
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        if (countdownTimer) {
            countdownTimer.style.display = 'none';
            countdownTimer.classList.remove('warning');
        }
    }
    
    // 开始倒计时
    function startCountdown(seconds) {
        stopCountdown();
        
        if (!countdownTimer || !timerSecondsSpan) return;
        
        let remaining = seconds;
        timerSecondsSpan.textContent = remaining;
        countdownTimer.style.display = 'block';
        countdownTimer.classList.remove('warning');
        
        countdownInterval = setInterval(() => {
            remaining--;
            timerSecondsSpan.textContent = remaining;
            
            if (remaining <= 10) {
                countdownTimer.classList.add('warning');
            }
            
            if (remaining <= 0) {
                stopCountdown();
            }
        }, 1000);
    }
    
    function showMessage(message, isError = false) {
        gameMessageDiv.textContent = message;
        gameMessageDiv.style.background = isError ? '#e74c3c' : '#27ae60';
        gameMessageDiv.classList.add('show');
        setTimeout(() => {
            gameMessageDiv.classList.remove('show');
        }, 3000);
    }
    
    function initBoard() {
        if (!gameBoard) return;
        gameBoard.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell empty';
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.addEventListener('click', () => onCellClick(i, j));
                gameBoard.appendChild(cell);
            }
        }
    }
    
    function updateBoardDisplay(grid) {
        if (!grid || !gameBoard) return;
        gameGrid = grid;
        const cells = gameBoard.children;
        let cellIndex = 0;
        
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const cell = cells[cellIndex];
                const block = grid[i][j];
                
                if (block === null) {
                    cell.className = 'grid-cell empty';
                    cell.innerHTML = '';
                } else {
                    const colorClass = `block-${block.color}`;
                    const iconHtml = shapeIcon[block.shape] || '<i class="fa-regular fa-circle"></i>';
                    cell.className = `grid-cell occupied ${colorClass}`;
                    cell.innerHTML = `<div class="block-inner" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${iconHtml}</div>`;
                }
                cellIndex++;
            }
        }
    }
    
    function displayBlock(block, container) {
        if (!container || !block) return;
        const colorClass = `block-${block.color}`;
        const iconHtml = shapeIcon[block.shape] || '<i class="fa-regular fa-circle"></i>';
        
        container.className = `current-block ${colorClass}`;
        container.innerHTML = `<div class="block-inner" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">${iconHtml}</div>`;
    }
    
    function updatePlayers(players, scores, currentPlayer) {
        if (!players || players.length === 0) {
            if (scoreList) scoreList.innerHTML = '<li>Waiting for players...</li>';
            if (playersOrderList) playersOrderList.innerHTML = '<li>No players yet</li>';
            if (gameStatusText) gameStatusText.textContent = 'Waiting for players';
            return;
        }
        
        if (gameStatusText) gameStatusText.textContent = 'Game in progress';
        
        const sortedPlayers = [...players].sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0));
        if (scoreList) {
            scoreList.innerHTML = sortedPlayers.map(p => `
                <li>
                    ${p.name} 
                    ${currentPlayer?.id === p.id ? '🎯' : ''}
                    <strong style="float: right;">${scores[p.id] || 0}</strong>
                </li>
            `).join('');
        }
        
        if (playersOrderList) {
            playersOrderList.innerHTML = players.map(p => `
                <li>
                    ${p.name}
                    ${currentPlayer?.id === p.id ? '<span class="current-turn">Current Turn</span>' : ''}
                </li>
            `).join('');
        }
    }
    
    function updateTurnIndicator(isMyTurn, currentPlayer) {
        myTurn = isMyTurn;
        if (isMyTurn) {
            if (turnIndicator) {
                turnIndicator.textContent = '🌸 YOUR TURN! Click on an empty cell to place your block 🌸';
                turnIndicator.className = 'turn-indicator your-turn';
            }
            if (currentBlockArea) currentBlockArea.style.display = 'block';
            
            // 开始60秒倒计时
            startCountdown(60);
            
            socket.emit('get_current_block', (response) => {
                if (response && response.success) {
                    currentBlock = response.block;
                    displayBlock(currentBlock, currentBlockDiv);
                } else {
                    showMessage('Waiting for blocks to become available...', false);
                }
            });
        } else {
            if (turnIndicator) {
                turnIndicator.textContent = `💜 Waiting for ${currentPlayer?.name || 'other player'}'s turn... 💜`;
                turnIndicator.className = 'turn-indicator waiting';
            }
            if (currentBlockArea) currentBlockArea.style.display = 'none';
            currentBlock = null;
            
            // 停止倒计时
            stopCountdown();
        }
    }
    
    function onCellClick(row, col) {
        if (!myTurn) {
            showMessage("It's not your turn!", true);
            return;
        }
        
        if (!currentBlock) {
            showMessage("No block available! Please wait.", true);
            return;
        }
        
        if (gameGrid && gameGrid[row][col] !== null) {
            showMessage("This cell is already occupied!", true);
            return;
        }
        
        socket.emit('place_block', { row, col, block: currentBlock }, (response) => {
            if (response && response.success) {
                showMessage(`✨ Block placed! +${response.pointsEarned || 0} points! ✨`);
                myTurn = false;
                if (turnIndicator) {
                    turnIndicator.textContent = '⏳ Waiting for next turn... ⏳';
                    turnIndicator.className = 'turn-indicator waiting';
                }
                if (currentBlockArea) currentBlockArea.style.display = 'none';
                currentBlock = null;
                stopCountdown();
            } else {
                showMessage(response?.error || 'Failed to place block', true);
            }
        });
    }
    
    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim();
            if (!playerName) {
                showMessage('Please enter a name', true);
                return;
            }
            
            socket.emit('register_player', playerName, (response) => {
                if (response && response.success) {
                    currentPlayerName = playerName;
                    currentPlayerId = socket.id;
                    if (registrationArea) registrationArea.style.display = 'none';
                    if (gameStatusDiv) gameStatusDiv.style.display = 'block';
                    if (currentPlayerNameSpan) currentPlayerNameSpan.textContent = playerName;
                    showMessage(`🎉 Welcome, ${playerName}! Waiting for game to start... 🎉`);
                    initBoard();
                } else {
                    showMessage(response?.error || 'Failed to join game. Name might be taken.', true);
                }
            });
        });
    }
    
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showMessage('Disconnected from server! Please refresh the page.', true);
    });
    
    socket.on('game_state', (state) => {
        if (state) {
            updateBoardDisplay(state.grid);
            updatePlayers(state.players, state.scores, state.currentPlayer);
            if (poolSizeSpan) poolSizeSpan.textContent = state.poolSize;
            const isMyTurn = state.currentPlayer?.id === socket.id;
            updateTurnIndicator(isMyTurn, state.currentPlayer);
        }
    });
    
    socket.on('players_update', (data) => {
        if (data) {
            updatePlayers(data.players, data.scores, data.currentPlayer);
            const isMyTurn = data.currentPlayer?.id === socket.id;
            updateTurnIndicator(isMyTurn, data.currentPlayer);
        }
    });
    
    socket.on('game_update', (data) => {
        if (data) {
            updateBoardDisplay(data.grid);
            updatePlayers(data.players, data.scores, data.currentPlayer);
            if (poolSizeSpan) poolSizeSpan.textContent = data.poolSize;
            const isMyTurn = data.currentPlayer?.id === socket.id;
            updateTurnIndicator(isMyTurn, data.currentPlayer);
            
            if (data.lastPlacement) {
                if (data.lastPlacement.playerId === socket.id) {
                    showMessage(`🎊 You earned ${data.lastPlacement.pointsEarned} points! ${data.lastPlacement.isFullClear ? 'JACKPOT! 🎰' : ''} 🎊`);
                } else {
                    showMessage(`${data.lastPlacement.playerName} placed a block and earned ${data.lastPlacement.pointsEarned} points!`);
                }
            }
        }
    });
    
    socket.on('turn_changed', (data) => {
        if (data) {
            const isMyTurn = data.currentPlayer?.id === socket.id;
            updateTurnIndicator(isMyTurn, data.currentPlayer);
            if (!isMyTurn && data.currentPlayer) {
                showMessage(`💫 It's now ${data.currentPlayer.name}'s turn 💫`);
            } else if (isMyTurn) {
                showMessage("🌟 It's your turn! Place your block! 🌟");
            }
        }
    });
    
    socket.on('turn_timeout', (data) => {
        if (data && data.playerId === socket.id) {
            showMessage("⏰ Your turn timed out! Moving to next player. ⏰", true);
            stopCountdown();
        }
    });
    
    initBoard();
});