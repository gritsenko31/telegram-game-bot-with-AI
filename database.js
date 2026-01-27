const { MongoClient } = require('mongodb');
require('dotenv').config();

let db;
let client;

async function connectDatabase() {
  try {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    db = client.db();
    
    // Создаем индексы
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });
    await db.collection('games').createIndex({ userId: 1 });
    await db.collection('achievements').createIndex({ userId: 1 });
    await db.collection('multiplayer').createIndex({ roomId: 1 });
    
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Пользователи
async function getUser(userId) {
  return await db.collection('users').findOne({ userId });
}

async function createOrUpdateUser(userId, username) {
  const now = new Date();
  
  await db.collection('users').updateOne(
    { userId },
    {
      $set: { username, lastActive: now },
      $setOnInsert: { 
        createdAt: now,
        totalGames: 0,
        totalWins: 0,
        bestAttempts: null,
        achievements: []
      }
    },
    { upsert: true }
  );
  
  return await getUser(userId);
}

// Игровые сессии
async function createGame(userId, level, maxNumber, secretNumber) {
  const game = {
    userId,
    level,
    maxNumber,
    secretNumber,
    attempts: 0,
    startTime: new Date(),
    endTime: null,
    won: false,
    guesses: []
  };
  
  const result = await db.collection('games').insertOne(game);
  return { ...game, _id: result.insertedId };
}

async function updateGame(gameId, updates) {
  await db.collection('games').updateOne(
    { _id: gameId },
    { $set: updates }
  );
}

async function addGuess(gameId, guess, result) {
  await db.collection('games').updateOne(
    { _id: gameId },
    {
      $push: { guesses: { guess, result, time: new Date() } },
      $inc: { attempts: 1 }
    }
  );
}

async function finishGame(gameId, won) {
  const endTime = new Date();
  await db.collection('games').updateOne(
    { _id: gameId },
    {
      $set: { endTime, won }
    }
  );
  
  const game = await db.collection('games').findOne({ _id: gameId });
  const duration = (endTime - game.startTime) / 1000;
  
  if (won) {
    await db.collection('users').updateOne(
      { userId: game.userId },
      {
        $inc: { totalWins: 1, totalGames: 1 },
        $min: { bestAttempts: game.attempts }
      }
    );
  } else {
    await db.collection('users').updateOne(
      { userId: game.userId },
      { $inc: { totalGames: 1 } }
    );
  }
  
  return { game, duration };
}

// Статистика
async function getUserStats(userId) {
  const user = await getUser(userId);
  const games = await db.collection('games')
    .find({ userId, won: true })
    .sort({ attempts: 1 })
    .limit(10)
    .toArray();
  
  const levelStats = await db.collection('games').aggregate([
    { $match: { userId, won: true } },
    {
      $group: {
        _id: '$level',
        count: { $sum: 1 },
        avgAttempts: { $avg: '$attempts' },
        bestAttempts: { $min: '$attempts' }
      }
    }
  ]).toArray();
  
  return { user, topGames: games, levelStats };
}

// Таблица лидеров
async function getLeaderboard(limit = 10) {
  return await db.collection('users')
    .find({ bestAttempts: { $ne: null } })
    .sort({ bestAttempts: 1, totalWins: -1 })
    .limit(limit)
    .toArray();
}

// Достижения
async function addAchievement(userId, achievementId, name, description) {
  const user = await getUser(userId);
  
  if (user.achievements.includes(achievementId)) {
    return false;
  }
  
  await db.collection('users').updateOne(
    { userId },
    { $push: { achievements: achievementId } }
  );
  
  await db.collection('achievements').insertOne({
    userId,
    achievementId,
    name,
    description,
    unlockedAt: new Date()
  });
  
  return true;
}

async function getUserAchievements(userId) {
  return await db.collection('achievements')
    .find({ userId })
    .sort({ unlockedAt: -1 })
    .toArray();
}

// Multiplayer
async function createRoom(hostId, hostUsername, level, maxNumber) {
  const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
  const secretNumber = Math.floor(Math.random() * maxNumber) + 1;
  
  const room = {
    roomId,
    hostId,
    level,
    maxNumber,
    secretNumber,
    players: [{ userId: hostId, username: hostUsername, attempts: 0, active: true }],
    status: 'waiting',
    winner: null,
    createdAt: new Date()
  };
  
  await db.collection('multiplayer').insertOne(room);
  return room;
}

async function joinRoom(roomId, userId, username) {
  const room = await db.collection('multiplayer').findOne({ roomId, status: 'waiting' });
  
  if (!room) return null;
  
  await db.collection('multiplayer').updateOne(
    { roomId },
    {
      $push: {
        players: { userId, username, attempts: 0, active: true }
      }
    }
  );
  
  return await db.collection('multiplayer').findOne({ roomId });
}

async function startMultiplayerGame(roomId) {
  await db.collection('multiplayer').updateOne(
    { roomId },
    { $set: { status: 'playing', startTime: new Date() } }
  );
}

async function addMultiplayerGuess(roomId, userId, guess) {
  await db.collection('multiplayer').updateOne(
    { roomId, 'players.userId': userId },
    { $inc: { 'players.$.attempts': 1 } }
  );
}

async function finishMultiplayerGame(roomId, winnerId) {
  await db.collection('multiplayer').updateOne(
    { roomId },
    {
      $set: {
        status: 'finished',
        winner: winnerId,
        endTime: new Date()
      }
    }
  );
  
  return await db.collection('multiplayer').findOne({ roomId });
}

async function getRoom(roomId) {
  return await db.collection('multiplayer').findOne({ roomId });
}

async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('✅ MongoDB connection closed');
  }
}

module.exports = {
  connectDatabase,
  closeDatabase,
  getUser,
  createOrUpdateUser,
  createGame,
  updateGame,
  addGuess,
  finishGame,
  getUserStats,
  getLeaderboard,
  addAchievement,
  getUserAchievements,
  createRoom,
  joinRoom,
  startMultiplayerGame,
  addMultiplayerGuess,
  finishMultiplayerGame,
  getRoom,
  db: () => db
};
