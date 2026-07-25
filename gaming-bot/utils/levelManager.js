const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'levels.json');
const XP_COOLDOWN_MS = 60 * 1000;
const MIN_XP_PER_MESSAGE = 15;
const MAX_XP_PER_MESSAGE = 25;

function loadLevels() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveLevels(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function xpForNextLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function getUser(userId) {
  const data = loadLevels();
  if (!data[userId]) {
    data[userId] = { xp: 0, level: 0, lastMessage: 0 };
    saveLevels(data);
  }
  return data[userId];
}

function addXpForMessage(userId) {
  const data = loadLevels();
  if (!data[userId]) data[userId] = { xp: 0, level: 0, lastMessage: 0 };

  const user = data[userId];
  const now = Date.now();

  if (now - user.lastMessage < XP_COOLDOWN_MS) {
    return null;
  }

  user.lastMessage = now;
  const gained = Math.floor(Math.random() * (MAX_XP_PER_MESSAGE - MIN_XP_PER_MESSAGE + 1)) + MIN_XP_PER_MESSAGE;
  user.xp += gained;

  let leveledUp = false;
  let needed = xpForNextLevel(user.level);
  while (user.xp >= needed) {
    user.xp -= needed;
    user.level += 1;
    leveledUp = true;
    needed = xpForNextLevel(user.level);
  }

  saveLevels(data);
  return { leveledUp, newLevel: user.level };
}

function getRank(userId) {
  const data = loadLevels();
  const ids = Object.keys(data).sort((a, b) => {
    if (data[b].level !== data[a].level) return data[b].level - data[a].level;
    return data[b].xp - data[a].xp;
  });
  const position = ids.indexOf(userId) + 1;
  return position || null;
}

function getLeaderboard(limit = 10) {
  const data = loadLevels();
  return Object.entries(data)
    .sort((a, b) => {
      if (b[1].level !== a[1].level) return b[1].level - a[1].level;
      return b[1].xp - a[1].xp;
    })
    .slice(0, limit)
    .map(([userId, stats]) => ({ userId, ...stats }));
}

module.exports = {
  getUser,
  addXpForMessage,
  getRank,
  getLeaderboard,
  xpForNextLevel,
};
