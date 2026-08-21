const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'staffStats.json');

const BLANK_STATS = {
  ticketsHandled: 0,
  ticketsClosed: 0,
  ticketsRenamed: 0,
  partnersCompleted: 0,
  giveawaysSponsored: 0,
  moderationActions: 0,
  messageId: null,
};

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
  const lines = [
    '————————————————',
    `<@${userId}>`,
    '-----------------------------',
    `${stats.ticketsRenamed || 0}  - Tickets Renamed`,
    `${stats.ticketsHandled || 0}  - Tickets Handled`,
    `${stats.ticketsClosed || 0}  - Tickets Closed`,
    `${stats.partnersCompleted || 0}  - Partners Completed`,
    `${stats.giveawaysSponsored || 0}  - Giveaways Sponsored`,
    `${stats.moderationActions || 0}  - Moderation Actions`,
  ];

  return new EmbedBuilder().setDescription(lines.join('\n')).setColor('#5865F2').setTimestamp();
}

// Posts (or edits, if one already exists) a staff member's tracker embed
// reflecting their current stats, without changing any of them. Used both
// to pre-seed embeds for a whole role at once, and internally by
// incrementStat() after a stat changes. Returns true if it succeeded.
async function renderStaffEmbed(guild, userId) {
  const channelId = config.staffTrackerChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return false;

  const allStats = loadStats();
  const key = `${guild.id}:${userId}`;
  const entry = allStats[key] || { ...BLANK_STATS };

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const embed = buildStaffEmbed(userId, entry);

  if (entry.messageId) {
    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] }).catch(() => {});
      allStats[key] = entry;
      saveStats(allStats);
      return true;
    }
  }

  const sent = await channel.send({ embeds: [embed] }).catch(() => null);
  if (!sent) return false;

  entry.messageId = sent.id;
  allStats[key] = entry;
  saveStats(allStats);
  return true;
}

// Bumps a stat for a staff member by 1, creating their tracker embed the
// first time they take any tracked action, and editing it in place after
// that. Safe to call even if staffTrackerChannelId isn't configured yet —
// it just no-ops.
async function incrementStat(guild, userId, statKey) {
  const channelId = config.staffTrackerChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return;

  const allStats = loadStats();
  const key = `${guild.id}:${userId}`;
  const entry = allStats[key] || { ...BLANK_STATS };

  entry[statKey] = (entry[statKey] || 0) + 1;
  allStats[key] = entry;
  saveStats(allStats);

  await renderStaffEmbed(guild, userId);
}

module.exports = { incrementStat, renderStaffEmbed, buildStaffEmbed, loadStats };
