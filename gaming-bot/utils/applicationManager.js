const { EmbedBuilder } = require('discord.js');

// Temporary in-memory storage for answers collected from the first modal
// while we wait for the user to submit the second modal (6th question).
const pendingAnswers = new Map();

function keyFor(userId, appId) {
  return `${userId}:${appId}`;
}

function savePartial(userId, appId, answers) {
  const key = keyFor(userId, appId);
  pendingAnswers.set(key, answers);
  // Auto-expire after 10 minutes in case they never finish the second modal
  setTimeout(() => pendingAnswers.delete(key), 10 * 60 * 1000);
}

function getPartial(userId, appId) {
  return pendingAnswers.get(keyFor(userId, appId));
}

function clearPartial(userId, appId) {
  pendingAnswers.delete(keyFor(userId, appId));
}

function buildApplicationEmbed(member, appConfig, answers) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 New Application: ${appConfig.label}`)
    .setColor(appConfig.color || '#5865F2')
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({ text: `User ID: ${member.id}` })
    .setTimestamp();

  appConfig.questions.forEach((q, i) => {
    embed.addFields({ name: q, value: answers[i] || 'No answer', inline: false });
  });

  return embed;
}

module.exports = { savePartial, getPartial, clearPartial, buildApplicationEmbed };
