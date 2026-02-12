require('dotenv').config();  // ПЕРВЫЙ!
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const achievements = require('./achievements');
const multiplayer = require('./multiplayer');

// ========== HEALTH CHECK ENDPOINT ==========
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running! ✅');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});
// ========== END HEALTH CHECK ==========

const bot = new Telegraf(process.env.BOT_TOKEN);
const activeGames = new Map();

(async () => {
  await db.connectDatabase();
  bot.launch();
  console.log('✅ Bot launched with AI!');
})();

function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🎮 Solo Game', 'solo_game')],
    [Markup.button.callback('👥 Multiplayer', 'multiplayer')],
    [Markup.button.callback('📊 My Stats', 'stats')],
    [Markup.button.callback('🏆 Leaderboard', 'leaderboard')],
    [Markup.button.callback('🎖️ Achievements', 'achievements_menu')]
  ]);
}

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  
  await db.createOrUpdateUser(userId, username);
  
  ctx.reply(
    '🎮 Welcome to Guess The Number!\n\n' +
    'I\'ll think of a number and you try to guess it.\n' +
    'The fewer attempts, the better your score!\n\n' +
    'Choose your game mode:',
    mainMenuKeyboard()
  );
});

bot.action('main_menu', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply('🏠 Main Menu:', mainMenuKeyboard());
});

bot.action('solo_game', async (ctx) => {
  await ctx.answerCbQuery();
  ctx.reply(
    '🎯 Choose difficulty:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Easy (1-10)', 'solo_easy')],
      [Markup.button.callback('🟡 Medium (1-50)', 'solo_medium')],
      [Markup.button.callback('🔴 Hard (1-100)', 'solo_hard')],
      [Markup.button.callback('« Back', 'main_menu')]
    ])
  );
});

bot.action(/solo_(easy|medium|hard)/, async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  const levelRaw = ctx.match[1];
  
  await db.createOrUpdateUser(userId, username);
  
  let maxNumber, level;
  switch(levelRaw) {
    case 'easy':
      maxNumber = 10;
      level = 'Easy';
      break;
    case 'medium':
      maxNumber = 50;
      level = 'Medium';
      break;
    case 'hard':
      maxNumber = 100;
      level = 'Hard';
      break;
  }
  
  const secretNumber = Math.floor(Math.random() * maxNumber) + 1;
  const game = await db.createGame(userId, level, maxNumber, secretNumber);
  
  const timeLimit = levelRaw === 'easy' ? 60 : levelRaw === 'medium' ? 90 : 120;
  
  const timeoutId = setTimeout(async () => {
    await handleTimeout(userId);
  }, timeLimit * 1000);
  
  activeGames.set(userId, { gameId: game._id, timeoutId, secretNumber, maxNumber, level });
  
  await ctx.answerCbQuery();
  ctx.reply(
    `🎯 Level: ${level}\n` +
    `Range: 1-${maxNumber}\n` +
    `⏱️ Time limit: ${timeLimit} seconds\n\n` +
    `I've thought of a number. Try to guess it!\n` +
    `Just type a number.`
  );
});

// ✅ ОБНОВЛЕННЫЙ ОБРАБОТЧИК - AI ДОСТУПЕН ВСЕГДА
bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;
  
  // Игнорируем команды
  if (text.startsWith('/')) return;
  
  const guess = parseInt(text);
  
  // ✅ AI РЕЖИМ — если НЕ число, ВСЕГДА отвечает AI
  if (isNaN(guess)) {
    try {
      const prompt = `You are a friendly assistant in a number guessing game bot. 
      Users can ask about rules, request hints, or just chat. 
      Always respond in English, keep answers brief (under 100 words) and friendly.
      Be encouraging and fun!
      User's message: ${text}`;
      
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }
      
      const aiResponse = data.candidates[0].content.parts[0].text;
      return ctx.reply(aiResponse);
    } catch (error) {
      console.error('AI Error:', error);
      return ctx.reply('Sorry, I couldn\'t process your message. Try again or type /start for a new game! 🎮');
    }
  }
  
  // ===== ДАЛЬШЕ ТОЛЬКО ЧИСЛА =====
  
  // МУЛЬТИПЛЕЕР
  const mpRooms = Array.from(multiplayer.activeRooms.entries());
  const userRoom = mpRooms.find(([roomId, data]) => {
    const room = data.room;
    return room && room.players && room.players.some(p => p.userId === userId);
  });
  
  if (userRoom) {
    const [roomId] = userRoom;
    const room = await db.getRoom(roomId);
    
    if (room && room.status === 'playing' && room.players.some(p => p.userId === userId)) {
      if (guess < 1 || guess > room.maxNumber) {
        return ctx.reply(`❌ Number must be between 1 and ${room.maxNumber}!`);
      }
      
      return await multiplayer.handleGuess(ctx, roomId, guess);
    }
  }
  
  // ОЖИДАНИЕ КОДА КОМНАТЫ
  const activeGame = activeGames.get(userId);
  if (activeGame && activeGame.waitingForRoomCode) {
    const roomCode = text.toUpperCase().trim();
    
    if (roomCode.length === 6) {
      activeGames.delete(userId);
      
      const room = await multiplayer.handleJoinRoom(ctx, roomCode);
      
      if (room) {
        return ctx.reply(
          `✅ Joined room ${roomCode}!\n\n` +
          `📊 Level: ${room.level}\n` +
          `👥 Players: ${room.players.length}\n\n` +
          `Waiting for host to start the game...`
        );
      } else {
        return ctx.reply(
          '❌ Room not found or already started!\n' +
          'Check the code and try again.',
          Markup.inlineKeyboard([
            [Markup.button.callback('🔍 Try Again', 'join_room_prompt')],
            [Markup.button.callback('🏠 Main Menu', 'main_menu')]
          ])
        );
      }
    }
  }
  
  // СОЛО ИГРА
  if (activeGame && !activeGame.waitingForRoomCode) {
    if (guess < 1 || guess > activeGame.maxNumber) {
      return ctx.reply(`❌ Number must be between 1 and ${activeGame.maxNumber}!`);
    }
    
    const result = guess === activeGame.secretNumber ? 'correct' 
      : guess < activeGame.secretNumber ? 'higher' 
      : 'lower';
    
    await db.addGuess(activeGame.gameId, guess, result);
    
    if (guess === activeGame.secretNumber) {
      clearTimeout(activeGame.timeoutId);
      
      const { game, duration } = await db.finishGame(activeGame.gameId, true);
      activeGames.delete(userId);
      
      const unlockedAchievements = await achievements.checkAchievements(userId, game, duration);
      
      let message = `🎉 Congratulations! You guessed the number ${activeGame.secretNumber}!\n` +
        `📊 Attempts: ${game.attempts}\n` +
        `⏱️ Time: ${duration.toFixed(1)}s\n`;
      
      if (unlockedAchievements.length > 0) {
        message += `\n🎖️ New Achievements:\n`;
        unlockedAchievements.forEach(a => {
          message += `${a.name}\n`;
        });
      }
      
      return ctx.reply(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Play Again', 'solo_game')],
          [Markup.button.callback('📊 Stats', 'stats')],
          [Markup.button.callback('🏠 Menu', 'main_menu')]
        ])
      );
    } else {
      const hint = result === 'higher' ? 'HIGHER ⬆️' : 'LOWER ⬇️';
      const dbInstance = db.db();
      const gameData = await dbInstance.collection('games').findOne({ _id: activeGame.gameId });
      return ctx.reply(`My number is ${hint}\nAttempts: ${gameData.attempts}`);
    }
  }
  
  // Если число, но НЕТ активной игры
  return ctx.reply('No active game. Type /start to begin!', mainMenuKeyboard());
});

async function handleTimeout(userId) {
  const activeGame = activeGames.get(userId);
  
  if (!activeGame) return;
  
  await db.finishGame(activeGame.gameId, false);
  activeGames.delete(userId);
  
  bot.telegram.sendMessage(
    userId,
    `⏱️ Time's up!\nThe number was ${activeGame.secretNumber}.\nBetter luck next time!`,
    mainMenuKeyboard()
  );
}

bot.action('stats', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  const { user, topGames, levelStats } = await db.getUserStats(userId);
  
  if (!user) {
    return ctx.reply('No stats yet. Play your first game!', mainMenuKeyboard());
  }
  
  let message = `📊 Your Statistics:\n\n`;
  message += `🎮 Total Games: ${user.totalGames}\n`;
  message += `🏆 Wins: ${user.totalWins}\n`;
  message += `📈 Win Rate: ${user.totalGames > 0 ? ((user.totalWins / user.totalGames) * 100).toFixed(1) : 0}%\n`;
  message += `⭐ Best Score: ${user.bestAttempts || 'N/A'} attempts\n`;
  message += `🎖️ Achievements: ${user.achievements.length}\n\n`;
  
  if (levelStats.length > 0) {
    message += `📊 By Level:\n`;
    levelStats.forEach(stat => {
      message += `${stat._id}: ${stat.count} wins, avg ${stat.avgAttempts.toFixed(1)} attempts\n`;
    });
  }
  
  ctx.reply(message, mainMenuKeyboard());
});

bot.action('leaderboard', async (ctx) => {
  await ctx.answerCbQuery();
  
  const leaders = await db.getLeaderboard(10);
  
  if (leaders.length === 0) {
    return ctx.reply('🏆 Leaderboard is empty!\nBe the first!', mainMenuKeyboard());
  }
  
  let message = '🏆 Top 10 Players:\n\n';
  
  leaders.forEach((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    message += `${medal} @${user.username}\n`;
    message += `  Best: ${user.bestAttempts} attempts | Wins: ${user.totalWins}\n\n`;
  });
  
  ctx.reply(message, mainMenuKeyboard());
});

bot.action('achievements_menu', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  const userAchievements = await db.getUserAchievements(userId);
  const user = await db.getUser(userId);
  
  const allAchievements = Object.values(achievements.ACHIEVEMENTS);
  const unlockedIds = user.achievements || [];
  
  let message = `🎖️ Your Achievements (${unlockedIds.length}/${allAchievements.length}):\n\n`;
  
  if (userAchievements.length === 0) {
    message += 'No achievements yet. Keep playing!\n\n';
  } else {
    userAchievements.forEach(a => {
      message += `${a.name}\n${a.description}\n\n`;
    });
  }
  
  message += `🔒 Locked Achievements:\n`;
  
  const lockedAchievements = allAchievements.filter(a => !unlockedIds.includes(a.id));
  lockedAchievements.forEach(a => {
    message += `❓ ${a.description}\n`;
  });
  
  ctx.reply(message, mainMenuKeyboard());
});

bot.action('multiplayer', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.reply(
    '👥 Multiplayer Mode:\n\n' +
    'Create a room or join an existing one.\n' +
    'First player to guess wins!',
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Create Room', 'create_room')],
      [Markup.button.callback('🔍 Join Room', 'join_room_prompt')],
      [Markup.button.callback('« Back', 'main_menu')]
    ])
  );
});

bot.action('create_room', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.reply(
    '🎯 Choose difficulty for multiplayer:',
    Markup.inlineKeyboard([
      [Markup.button.callback('🟢 Easy (1-10)', 'mp_easy')],
      [Markup.button.callback('🟡 Medium (1-50)', 'mp_medium')],
      [Markup.button.callback('🔴 Hard (1-100)', 'mp_hard')],
      [Markup.button.callback('« Back', 'multiplayer')]
    ])
  );
});

bot.action(/mp_(easy|medium|hard)/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const level = ctx.match[1];
  const room = await multiplayer.createMultiplayerRoom(ctx, level);
  
  multiplayer.activeRooms.set(room.roomId, { ctx, room });
  
  ctx.reply(
    `✅ Room created!\n\n` +
    `🔑 Room Code: ${room.roomId}\n` +
    `📊 Level: ${room.level}\n` +
    `👥 Players: ${room.players.length}\n\n` +
    `Share this code with friends!\n` +
    `Waiting for players to join...\n\n` +
    `You can start the game when ready.`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🎮 Start Game', `start_mp_${room.roomId}`)],
      [Markup.button.callback('❌ Cancel', `cancel_mp_${room.roomId}`)]
    ])
  );
});

bot.action('join_room_prompt', async (ctx) => {
  await ctx.answerCbQuery();
  
  ctx.reply(
    '🔍 Enter the 6-character room code:\n' +
    'Example: ABC123\n\n' +
    'Type the code in the chat.'
  );
  
  const userId = ctx.from.id;
  activeGames.set(userId, { waitingForRoomCode: true });
});

bot.action(/start_mp_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const roomId = ctx.match[1];
  await multiplayer.startGame(ctx, roomId);
});

bot.action(/cancel_mp_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const roomId = ctx.match[1];
  multiplayer.activeRooms.delete(roomId);
  
  ctx.reply('❌ Room cancelled.', mainMenuKeyboard());
});

bot.help((ctx) => {
  ctx.reply(
    '❓ How to Play:\n\n' +
    '🎮 Solo Mode:\n' +
    '1. Choose difficulty level\n' +
    '2. I\'ll think of a number\n' +
    '3. Type numbers to guess\n' +
    '4. I\'ll tell you if it\'s higher or lower\n' +
    '5. Beat the time limit!\n\n' +
    '👥 Multiplayer Mode:\n' +
    '1. Create or join a room\n' +
    '2. First to guess wins!\n' +
    '3. 2 minute time limit\n\n' +
    '🤖 AI Assistant:\n' +
    'Ask me anything! "How to play?", "Give hint", "Tell joke"\n' +
    'Works ANYTIME during gameplay!\n\n' +
    '🎖️ Unlock achievements and climb the leaderboard!\n\n' +
    'Commands:\n' +
    '/start - Main menu\n' +
    '/help - This message',
    mainMenuKeyboard()
  );
});

process.once('SIGINT', async () => {
  await db.closeDatabase();
  bot.stop('SIGINT');
});

process.once('SIGTERM', async () => {
  await db.closeDatabase();
  bot.stop('SIGTERM');
});
