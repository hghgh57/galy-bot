const config = require('../config.json');
const {
  loadGiveaways,
  saveGiveaways,
  buildGiveawayEmbed,
  buildJoinRow,
  scheduleGiveaway,
} = require('./giveawayManager');

const DAY_MS = 24 * 60 * 60 * 1000;

async function postDailyGiveaway(client) {
  const settings = config.dailyGiveaway;
  if (!settings || !settings.enabled) return;

  const channelId = settings.channelId;
  if (!channelId || channelId.startsWith('PUT_')) {
    console.warn('Daily giveaway is enabled but dailyGiveaway.channelId is not set in config.json.');
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn('Daily giveaway channel could not be found.');
    return;
  }

  const prize = settings.prize || '1m Donut SMP';
  const winnerCount = settings.winnerCount || 1;
  const endTimestamp = Date.now() + DAY_MS;

  const embed = buildGiveawayEmbed(prize, endTimestamp, winnerCount, 0);
  const message = await channel.send({ embeds: [embed], components: [buildJoinRow()] }).catch(() => null);
  if (!message) return;

  const giveaways = loadGiveaways();
  giveaways[message.id] = {
    prize,
    winnerCount,
    endTimestamp,
    channelId: channel.id,
    entrants: [],
    ended: false,
  };
  saveGiveaways(giveaways);

  scheduleGiveaway(client, message.id, DAY_MS);
}

function startDailyGiveawayLoop(client) {
  const settings = config.dailyGiveaway;
  if (!settings || !settings.enabled) return;

  // Post one right away, then repeat every 24 hours.
  postDailyGiveaway(client);
  setInterval(() => postDailyGiveaway(client), DAY_MS);
}

module.exports = { startDailyGiveawayLoop };
