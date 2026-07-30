const config = require('../config.json');
const {
  loadGiveaways,
  saveGiveaways,
  buildGiveawayEmbed,
  buildJoinRow,
  scheduleGiveaway,
} = require('./giveawayManager');

const DAY_MS = 24 * 60 * 60 * 1000;

function getZoneOffsetMinutes(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour === '24' ? 0 : parts.hour,
    parts.minute,
    parts.second
  );
  return (asUTC - date.getTime()) / 60000;
}

function getNextRunTimestamp(hour, minute, timeZone) {
  const now = new Date();
  const offsetMinutes = getZoneOffsetMinutes(now, timeZone);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = dtf.formatToParts(now).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  let targetUTC =
    Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0) - offsetMinutes * 60000;
  if (targetUTC <= now.getTime()) {
    targetUTC += DAY_MS;
  }
  return targetUTC;
}

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

  const prize = settings.prize || '3m Donut SMP';
  const winnerCount = settings.winnerCount || 1;
  const endTimestamp = Date.now() + DAY_MS;
  const embed = buildGiveawayEmbed(prize, endTimestamp, winnerCount, 0);

  const messageAbove = settings.messageAbove || '@everyone';

  const message = await channel
    .send({
      content: messageAbove,
      embeds: [embed],
      components: [buildJoinRow()],
    })
    .catch(() => null);

  if (!message) return;

  if (settings.messageBelow) {
    await channel.send({ content: settings.messageBelow }).catch(() => {});
  }

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

  const hour = settings.hour ?? 23;
  const minute = settings.minute ?? 0;
  const timeZone = settings.timezone || 'Australia/Sydney';

  const scheduleNext = () => {
    const nextRun = getNextRunTimestamp(hour, minute, timeZone);
    const msUntilNext = nextRun - Date.now();

    console.log(
      `Next daily giveaway scheduled for ${new Date(nextRun).toLocaleString('en-AU', {
        timeZone,
      })} (${timeZone}).`
    );

    setTimeout(() => {
      postDailyGiveaway(client);
      scheduleNext();
    }, msUntilNext);
  };

  scheduleNext();
}

module.exports = { startDailyGiveawayLoop };
