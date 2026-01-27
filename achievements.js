const db = require('./database');

const ACHIEVEMENTS = {
  FIRST_WIN: {
    id: 'FIRST_WIN',
    name: '🎉 First Victory',
    description: 'Win your first game',
    check: async (userId, game) => {
      const user = await db.getUser(userId);
      return user.totalWins === 1;
    }
  },
  PERFECT_EASY: {
    id: 'PERFECT_EASY',
    name: '🎯 Perfect Easy',
    description: 'Win easy level in 1 attempt',
    check: async (userId, game) => {
      return game.level === 'Easy' && game.attempts === 1;
    }
  },
  SPEED_DEMON: {
    id: 'SPEED_DEMON',
    name: '⚡ Speed Demon',
    description: 'Win a game in under 30 seconds',
    check: async (userId, game, duration) => {
      return duration < 30;
    }
  },
  WIN_STREAK_5: {
    id: 'WIN_STREAK_5',
    name: '🔥 5 Win Streak',
    description: 'Win 5 games in a row',
    check: async (userId) => {
      const dbInstance = db.db();
      const games = await dbInstance.collection('games')
        .find({ userId })
        .sort({ endTime: -1 })
        .limit(5)
        .toArray();
      
      return games.length === 5 && games.every(g => g.won);
    }
  },
  HARD_MASTER: {
    id: 'HARD_MASTER',
    name: '💪 Hard Master',
    description: 'Win 10 hard level games',
    check: async (userId) => {
      const dbInstance = db.db();
      const count = await dbInstance.collection('games').countDocuments({
        userId,
        level: 'Hard',
        won: true
      });
      return count >= 10;
    }
  },
  LUCKY_NUMBER: {
    id: 'LUCKY_NUMBER',
    name: '🍀 Lucky Number',
    description: 'Guess the number on first try',
    check: async (userId, game) => {
      return game.attempts === 1;
    }
  },
  VETERAN: {
    id: 'VETERAN',
    name: '🎖️ Veteran',
    description: 'Play 50 games',
    check: async (userId) => {
      const user = await db.getUser(userId);
      return user.totalGames >= 50;
    }
  },
  MULTIPLAYER_CHAMPION: {
    id: 'MULTIPLAYER_CHAMPION',
    name: '👑 Multiplayer Champion',
    description: 'Win your first multiplayer game',
    check: async (userId, game, duration, isMultiplayer) => {
      return isMultiplayer === true;
    }
  }
};

async function checkAchievements(userId, game, duration = 0, isMultiplayer = false) {
  const unlocked = [];
  
  for (const achievement of Object.values(ACHIEVEMENTS)) {
    const shouldUnlock = await achievement.check(userId, game, duration, isMultiplayer);
    
    if (shouldUnlock) {
      const wasAdded = await db.addAchievement(
        userId,
        achievement.id,
        achievement.name,
        achievement.description
      );
      
      if (wasAdded) {
        unlocked.push(achievement);
      }
    }
  }
  
  return unlocked;
}

function formatAchievements(achievements) {
  if (achievements.length === 0) {
    return 'No achievements unlocked yet!';
  }
  
  return achievements
    .map(a => `${a.name}\n${a.description}`)
    .join('\n\n');
}

module.exports = {
  ACHIEVEMENTS,
  checkAchievements,
  formatAchievements
};
