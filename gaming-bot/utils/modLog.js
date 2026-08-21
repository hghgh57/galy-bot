const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const { incrementStat } = require('./staffTracker');

async function logModAction(guild, { action, moderator, target, reason, extra = [] }) {
  const channelId = config.modLogChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle(`🛡️ ${action}`)
    .addFields(
      { name: 'Target', value: `${target} (${target.tag})`, inline: true },
      { name: 'Moderator', value: `${moderator} (${moderator.tag})`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false },
      ...extra
    )
    .setColor('#ED4245')
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});

  incrementStat(guild, moderator.id, 'moderationActions').catch((err) => {
    console.error('Failed to update staff tracker for moderation action:', err);
  });
}

module.exports = { logModAction };
