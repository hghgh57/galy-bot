const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, 'changelog_state.json');

function loadLastAnnounced() {
  if (!fs.existsSync(STATE_FILE)) return 0;
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')).lastAnnouncedVersion || 0;
  } catch {
    return 0;
  }
}

function saveLastAnnounced(version) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastAnnouncedVersion: version }, null, 2));
}

async function announceNewChangelogEntries(client) {
  const entries = config.changelog || [];
  const channelId = config.changelogAnnounceChannelId;
  if (entries.length === 0 || !channelId || channelId.startsWith('PUT_')) return;

  const lastAnnounced = loadLastAnnounced();
  const newEntries = entries.filter((e) => e.version > lastAnnounced);

  if (newEntries.length === 0) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) return;

  const sorted = [...newEntries].sort((a, b) => a.version - b.version);
  const lines = sorted.map((entry) => `**Update ${entry.version}** — ${entry.title}`);

  const embed = new EmbedBuilder()
    .setTitle('📜 New Update!')
    .setDescription(lines.join('\n'))
    .setColor('#5865F2')
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch(() => {});

  const highestVersion = Math.max(...entries.map((e) => e.version));
  saveLastAnnounced(highestVersion);
}

module.exports = { announceNewChangelogEntries };
