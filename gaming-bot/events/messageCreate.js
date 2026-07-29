const { EmbedBuilder } = require('discord.js');
const { getSticky, updateLastMessageId } = require('../utils/stickyManager');
const { addXpForMessage } = require('../utils/levelManager');
const { checkTrap } = require('../utils/trapChannel');
const config = require('../config.json');
function buildProgressBar(current, needed, length = 20) {
  const filled = Math.max(0, Math.min(length, Math.round((current / needed) * length)));
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}
module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;
    const trapped = await checkTrap(message);
    if (trapped) return;
    const xpResult = addXpForMessage(message.author.id);
    if (xpResult && xpResult.leveledUp) {
      let targetChannel = message.channel;
      const levelUpChannelId = config.levelUpChannelId;
      if (levelUpChannelId && !levelUpChannelId.startsWith('PUT_')) {
        const fetched = await message.guild.channels.fetch(levelUpChannelId).catch(() => null);
        if (fetched) targetChannel = fetched;
      }
      const bar = buildProgressBar(xpResult.xp, xpResult.xpNeeded);
      const newlyEarnedRoleNames = [];
      const levelRoles = config.levelRoles || [];
      if (levelRoles.length > 0) {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member) {
          for (const entry of levelRoles) {
            if (!entry.roleId || entry.roleId.startsWith('PUT_')) continue;
            if (xpResult.newLevel < entry.level) continue;
            if (member.roles.cache.has(entry.roleId)) continue;
            const added = await member.roles.add(entry.roleId).catch(() => null);
            if (added) {
              const role = message.guild.roles.cache.get(entry.roleId);
              if (role) newlyEarnedRoleNames.push(role.name);
            }
          }
        }
      }
      let description =
        `🚀 ${message.author} leveled up from **level ${xpResult.oldLevel}** to **level ${xpResult.newLevel}**!\n\n` +
        `\`${bar}\`\n${xpResult.xp} / ${xpResult.xpNeeded} XP`;
      if (newlyEarnedRoleNames.length > 0) {
        description += `\n\n🎁 New role(s) unlocked: **${newlyEarnedRoleNames.join(', ')}**`;
      }
      const embed = new EmbedBuilder().setDescription(description).setColor('#5865F2');
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
