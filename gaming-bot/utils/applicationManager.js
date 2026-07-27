const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const pendingAnswers = new Map();

function keyFor(userId, appId) {
  return `${userId}:${appId}`;
}

function savePartial(userId, appId, answers) {
  const key = keyFor(userId, appId);
  pendingAnswers.set(key, answers);
  setTimeout(() => pendingAnswers.delete(key), 10 * 60 * 1000);
}

function getPartial(userId, appId) {
  return pendingAnswers.get(keyFor(userId, appId));
}

function clearPartial(userId, appId) {
  pendingAnswers.delete(keyFor(userId, appId));
}

// Persisted record of who has a pending (not-yet-decided) application,
// so they can't select the dropdown and submit a second one while waiting.
const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const APPLIED_FILE = path.join(DATA_DIR, 'applied.json');

function loadApplied() {
  if (!fs.existsSync(APPLIED_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(APPLIED_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveApplied(data) {
  fs.writeFileSync(APPLIED_FILE, JSON.stringify(data, null, 2));
}

function hasApplied(userId, appId) {
  const data = loadApplied();
  return Boolean(data[keyFor(userId, appId)]);
}

function markApplied(userId, appId) {
  const data = loadApplied();
  data[keyFor(userId, appId)] = true;
  saveApplied(data);
}

function clearApplied(userId, appId) {
  const data = loadApplied();
  delete data[keyFor(userId, appId)];
  saveApplied(data);
}

function buildApplicationEmbed(member, appConfig, answers) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application: ${appConfig.label}`)
    .setColor(appConfig.color || '#5865F2')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: 'Applicant', value: `${member} (${member.user.tag})`, inline: false })
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  appConfig.questions.forEach((q, i) => {
    embed.addFields({ name: q, value: answers[i] || 'No answer', inline: false });
  });

  return embed;
}

module.exports = {
  savePartial,
  getPartial,
  clearPartial,
  hasApplied,
  markApplied,
  clearApplied,
  buildApplicationEmbed,
};
