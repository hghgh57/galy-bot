const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const DAY_MS = 24 * 60 * 60 * 1000;

// Same timezone-aware "next run" math as dailyGiveaway.js, kept separate
// (rather than shared) so each feature can change independently.
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

async function postDailyQuote(client) {
  const settings = config.dailyQuote;
  if (!settings || !settings.enabled) return;

  const channelId = settings.channelId;
  if (!channelId || channelId.startsWith('PUT_')) {
    console.warn('Daily quote is enabled but dailyQuote.channelId is not set in config.json.');
    scheduleNext(client);
    return;
  }

  const quotes = settings.quotes || [];
  if (!quotes.length) {
    console.warn('Daily quote is enabled but dailyQuote.quotes is empty in config.json.');
    scheduleNext(client);
    return;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.warn('Daily quote channel could not be found.');
    scheduleNext(client);
    return;
  }

  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  const embed = new EmbedBuilder()
    .setTitle('💬 Quote of the Day')
    .setDescription(quote)
    .setColor('#5865F2')
    .setTimestamp();

  await channel.send({ embeds: [embed] }).catch((err) => {
    console.error('Failed to send daily quote:', err);
  });

  scheduleNext(client);
}

function scheduleNext(client) {
  const settings = config.dailyQuote;
  const hour = settings.hour ?? 9;
  const minute = settings.minute ?? 0;
  const timeZone = settings.timezone || 'Australia/Sydney';

  const nextRun = getNextRunTimestamp(hour, minute, timeZone);
  const msUntilNext = nextRun - Date.now();

  setTimeout(() => {
    postDailyQuote(client);
  }, msUntilNext);
}

function startDailyQuoteLoop(client) {
  const settings = config.dailyQuote;
  if (!settings || !settings.enabled) return;

  const hour = settings.hour ?? 9;
  const minute = settings.minute ?? 0;
  const timeZone = settings.timezone || 'Australia/Sydney';

  const nextRun = getNextRunTimestamp(hour, minute, timeZone);
  const msUntilNext = nextRun - Date.now();

  console.log(
    `First daily quote scheduled for ${new Date(nextRun).toLocaleString('en-AU', {
      timeZone,
    })} (${timeZone}).`
  );

  setTimeout(() => {
    postDailyQuote(client);
  }, msUntilNext);
}

module.exports = { startDailyQuoteLoop };
