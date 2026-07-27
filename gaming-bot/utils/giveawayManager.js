const fs = require('fs');
const path = require('path');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const DATA_DIR = process.env.DATA_DIR || '/app/data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DATA_FILE = path.join(DATA_DIR, 'giveaways.json');

function loadGiveaways() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveGiveaways(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function parseDuration(str) {
  const match = str.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return num * multipliers[unit];
}

function buildGiveawayEmbed(prize, endTimestamp, winnerCount, entrantCount, ended = false, winners = []) {
  const embed = new EmbedBuilder()
    .setTitle(`🎉 ${prize}`)
    .setColor(ended ? '#2F3136' : '#F47FFF')
    .setTimestamp(endTimestamp);

  if (ended) {
    embed.setDescription(
      winners.length > 0
        ? `**Winner(s):** ${winners.map((id) => `<@${id}>`).join(', ')}\n\nEntrants: ${entrantCount}`
        : `No valid entrants — no winner could be chosen.`
    );
    embed.setFooter({ text: 'Giveaway ended' });
  } else {
    embed.setDescription(
      `Click 🎉 below to enter!\n\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endTimestamp / 1000)}:R>\n**Entries:** ${entrantCount}`
    );
    embed.setFooter({ text: 'Good luck!' });
  }

  return embed;
}

function buildJoinRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('giveaway_join')
      .setLabel('Join Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

function pickWinners(entrants, count) {
  const pool = [...entrants];
  const winners = [];
  const num = Math.min(count, pool.length);
  for (let i = 0; i < num; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  return winners;
}

async function endGiveaway(client, messageId) {
  const giveaways = loadGiveaways();
  const giveaway = giveaways[messageId];
  if (!giveaway || giveaway.ended) return;

  try {
    const channel = await client.channels.fetch(giveaway.channelId);
    const message = await channel.messages.fetch(messageId);

    const winners = pickWinners(giveaway.entrants, giveaway.winnerCount);
    giveaway.ended = true;
    giveaway.winners = winners;
    giveaways[messageId] = giveaway;
    saveGiveaways(giveaways);

    const embed = buildGiveawayEmbed(
      giveaway.prize,
      giveaway.endTimestamp,
      giveaway.winnerCount,
      giveaway.entrants.length,
      true,
      winners
    );

    await message.edit({ embeds: [embed], components: [buildJoinRow(true)] });

    if (winners.length > 0) {
      await channel.send({
        content: `🎉 Congratulations ${winners.map((id) => `<@${id}>`).join(', ')}! You won **${giveaway.prize}**!`,
      });
    } else {
      await channel.send({ content: `No one entered the giveaway for **${giveaway.prize}**.` });
    }
  } catch (err) {
    console.error('Failed to end giveaway:', err);
  }
}

function scheduleGiveaway(client, messageId, msUntilEnd) {
  setTimeout(() => endGiveaway(client, messageId), msUntilEnd);
}

function rearmActiveGiveaways(client) {
  const giveaways = loadGiveaways();
  const now = Date.now();

  for (const [messageId, giveaway] of Object.entries(giveaways)) {
    if (giveaway.ended) continue;

    const msLeft = giveaway.endTimestamp - now;
    if (msLeft <= 0) {
      endGiveaway(client, messageId);
    } else {
      scheduleGiveaway(client, messageId, msLeft);
    }
  }
}

module.exports = {
  loadGiveaways,
  saveGiveaways,
  parseDuration,
  buildGiveawayEmbed,
  buildJoinRow,
  pickWinners,
  endGiveaway,
  scheduleGiveaway,
  rearmActiveGiveaways,
};
