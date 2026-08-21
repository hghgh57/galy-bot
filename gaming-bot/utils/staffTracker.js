const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'staffStats.json');

function loadStats() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveStats(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function buildStaffEmbed(userId, stats) {
  return new EmbedBuilder()
    .setTitle('📊 Staff Activity')
    .setDescription(`<@${userId}>`)
    .addFields(
      { name: 'Tickets Claimed', value: `${stats.ticketsClaimed || 0}`, inline: true },
      { name: 'Tickets Closed', value: `${stats.ticketsClosed || 0}`, inline: true },
      { name: 'Tickets Renamed', value: `${stats.ticketsRenamed || 0}`, inline: true },
      { name: 'Moderation Actions', value: `${stats.moderationActions || 0}`, inline: true }
    )
    .setColor('#5865F2')
    .setTimestamp();
}

// Bumps a stat for a staff member by 1, creating their tracker embed the
// first time they take any tracked action, and editing it in place after
// that. Safe to call even if staffTrackerChannelId isn't configured yet —
// it just no-ops, so wiring this in never breaks anything.
async function incrementStat(guild, userId, statKey) {
  const channelId = config.staffTrackerChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return;

  const allStats = loadStats();
  const key = `${guild.id}:${userId}`;
  const entry = allStats[key] || {
    ticketsClaimed: 0,
    ticketsClosed: 0,
    ticketsRenamed: 0,
    moderationActions: 0,
    messageId: null,
  };

  entry[statKey] = (entry[statKey] || 0) + 1;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = buildStaffEmbed(userId, entry);

  if (entry.messageId) {
    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] }).catch(() => {});
    } else {
      // Their old tracker message is gone (deleted?) — post a fresh one.
      const sent = await channel.send({ embeds: [embed] }).catch(() => null);
      if (sent) entry.messageId = sent.id;
    }
  } else {
    const sent = await channel.send({ embeds: [embed] }).catch(() => null);
    if (sent) entry.messageId = sent.id;
  }

  allStats[key] = entry;
  saveStats(allStats);
}

module.exports = { incrementStat, buildStaffEmbed, loadStats };
