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

module.exports = { savePartial, getPartial, clearPartial, buildApplicationEmbed };
