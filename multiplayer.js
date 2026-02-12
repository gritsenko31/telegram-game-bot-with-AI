const { Markup } = require('telegraf');
const db = require('./database');

const activeRooms = new Map();

async function createMultiplayerRoom(ctx, level) {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  
  let maxNumber;
  switch(level) {
    case 'easy': maxNumber = 10; break;
    case 'medium': maxNumber = 50; break;
    case 'hard': maxNumber = 100; break;
  }
  
  const room = await db.createRoom(userId, username, level, maxNumber);
  
  activeRooms.set(room.roomId, { ctx });
  
  return room;
}

async function handleJoinRoom(ctx, roomId) {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  
  const room = await db.joinRoom(roomId, userId, username);
  
  if (!room) {
    return ctx.reply('❌ Room not found or already started!');
  }
  
  const hostCtx = activeRooms.get(roomId)?.ctx;
  if (hostCtx) {
    await hostCtx.telegram.sendMessage(
      room.hostId,
      `✅ @${username} joined your room!\nPlayers: ${room.players.length}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🎮 Start Game', `start_mp_${roomId}`)],
        [Markup.button.callback('❌ Cancel', `cancel_mp_${roomId}`)]
      ])
    );
  }
  
  return room;
}

async function startGame(ctx, roomId) {
  const room = await db.getRoom(roomId);
  
  if (!room || room.status !== 'waiting') {
    return ctx.reply('❌ Cannot start this game!');
  }
  
  await db.startMultiplayerGame(roomId);
  
  for (const player of room.players) {
    await ctx.telegram.sendMessage(
      player.userId,
      `🎮 Multiplayer game started!\n` +
      `Level: ${room.level}\n` +
      `Range: 1-${room.maxNumber}\n` +
      `Players: ${room.players.length}\n\n` +
      `⏱️ You have 2 minutes to guess!\n` +
      `Type your guess now!`
    );
  }
  
  const timeoutId = setTimeout(async () => {
    await endGameByTimeout(ctx, roomId);
  }, 120000);
  
  activeRooms.set(roomId, { ctx, timeoutId });
}

async function handleGuess(ctx, roomId, guess) {
  const room = await db.getRoom(roomId);
  const userId = ctx.from.id;
  
  if (!room || room.status !== 'playing') {
    return;
  }
  
  await db.addMultiplayerGuess(roomId, userId, guess);
  
  if (guess === room.secretNumber) {
    clearTimeout(activeRooms.get(roomId)?.timeoutId);
    
    const finalRoom = await db.finishMultiplayerGame(roomId, userId);
    const winner = finalRoom.players.find(p => p.userId === userId);
    
    for (const player of finalRoom.players) {
      const isWinner = player.userId === userId;
      await ctx.telegram.sendMessage(
        player.userId,
        isWinner 
          ? `🏆 YOU WON!\nYou guessed ${room.secretNumber} in ${winner.attempts} attempts!`
          : `Game over! @${winner.username} won with ${winner.attempts} attempts.\nThe number was ${room.secretNumber}.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🎮 New Game', 'multiplayer')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      );
    }
    
    activeRooms.delete(roomId);
  } else {
    const hint = guess < room.secretNumber ? 'higher ⬆️' : 'lower ⬇️';
    await ctx.reply(`My number is ${hint}`);
  }
}

async function endGameByTimeout(ctx, roomId) {
  const room = await db.getRoom(roomId);
  
  if (room && room.status === 'playing') {
    await db.finishMultiplayerGame(roomId, null);
    
    const sortedPlayers = room.players.sort((a, b) => a.attempts - b.attempts);
    const closest = sortedPlayers[0];
    
    for (const player of room.players) {
      await ctx.telegram.sendMessage(
        player.userId,
        `⏱️ Time's up!\n` +
        `The number was ${room.secretNumber}\n` +
        `Closest player: @${closest.username} (${closest.attempts} attempts)`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🎮 New Game', 'multiplayer')],
          [Markup.button.callback('🏠 Main Menu', 'main_menu')]
        ])
      );
    }
    
    activeRooms.delete(roomId);
  }
}

module.exports = {
  createMultiplayerRoom,
  handleJoinRoom,
  startGame,
  handleGuess,
  activeRooms
};
