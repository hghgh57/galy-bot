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

function blankEntry() {
  return {
    ticketsRenamed: 0,
    ticketsHandled: 0,
    ticketsClosed: 0,
    partnersCompleted: 0,
    giveawaysSponsored: 0,
    moderationActions: 0,
    messageId: null,
  };
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
    `${stats.giveawaysSponsored || 0}  -  giveaways sponsored`,
    `${stats.moderationActions || 0}  - Moderation Actions`,
  ];

  return new EmbedBuilder().setDescription(lines.join('\n')).setColor('#5865F2');
}

// Creates a fresh, all-zero tracker embed for a staff member if they don't
// already have one (or their old message was deleted). Returns true if a
// new embed was posted, false if they already had a live one.
async function ensureStaffEmbed(guild, userId) {
  const channelId = config.staffTrackerChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return false;

  const allStats = loadStats();
  const key = `${guild.id}:${userId}`;
  let entry = allStats[key];

  if (entry?.messageId) {
    const existing = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (existing) return false; // already set up and still there
  }

  entry = entry || blankEntry();

  const embed = buildStaffEmbed(userId, entry);
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
// it just no-ops, so wiring this in never breaks anything.
async function incrementStat(guild, userId, statKey) {
  const channelId = config.staffTrackerChannelId;
  if (!channelId || channelId.startsWith('PUT_')) return;

  const allStats = loadStats();
  const key = `${guild.id}:${userId}`;
  const entry = allStats[key] || blankEntry();

  entry[statKey] = (entry[statKey] || 0) + 1;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const embed = buildStaffEmbed(userId, entry);

  if (entry.messageId) {
    const message = await channel.messages.fetch(entry.messageId).catch(() => null);
    if (message) {
      await message.edit({ embeds: [embed] }).catch(() => {});
    } else {
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

module.exports = { incrementStat, ensureStaffEmbed, buildStaffEmbed, loadStats };
