const { EmbedBuilder } = require('discord.js');
const { getSticky, updateLastMessageId } = require('../utils/stickyManager');
const { addXpForMessage } = require('../utils/levelManager');
const config = require('../config.json');

function buildProgressBar(current, needed, length = 20) {
  const filled = Math.max(0, Math.min(length, Math.round((current / needed) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const xpResult = addXpForMessage(message.author.id);
    if (xpResult && xpResult.leveledUp) {
      let targetChannel = message.channel;
      const levelUpChannelId = config.levelUpChannelId;
      if (levelUpChannelId && !levelUpChannelId.startsWith('PUT_')) {
        const fetched = await message.guild.channels.fetch(levelUpChannelId).catch(() => null);
        if (fetched) targetChannel = fetched;
      }

      const bar = buildProgressBar(xpResult.xp, xpResult.xpNeeded);

      const embed = new EmbedBuilder()
        .setDescription(
          `🚀 ${message.author} leveled up from **level ${xpResult.oldLevel}** to **level ${xpResult.newLevel}**!\n\n` +
            `\`${bar}\`\n${xpResult.xp} / ${xpResult.xpNeeded} XP`
        )
        .setColor('#5865F2');

      await targetChannel.send({ embeds: [embed] }).catch(() => {});
    }

    const sticky = getSticky(message.channel.id);
    if (sticky) {
      if (sticky.lastMessageId) {
        const oldMsg = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
      const sent = await message.channel.send(`📌 ${sticky.content}`).catch(() => null);
      if (sent) updateLastMessageId(message.channel.id, sent.id);
    }
  },
};
