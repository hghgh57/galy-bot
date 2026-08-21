const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

const POLL_INTERVAL_MS = 2 * 60 * 1000;

// TikTok's unauthenticated live-status page is flaky enough that a single
// "offline" reading isn't trusted — it was causing the live state to reset
// mid-stream (one bad scrape) and then re-fire the announcement on the very
// next successful "still live" read a couple minutes later. Requiring a
// few consecutive offline reads before flipping state fixes that without
// needing an authenticated TikTok API.
const OFFLINE_CONFIRM_THRESHOLD = 2;

// username -> { isLive: boolean, offlineStreak: number }
const knownLiveState = new Map();

async function isUserLive(username) {
  try {
    const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}/live`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!res.ok) return null;

    const html = await res.text();

    const statusMatch = html.match(/"status":\s*(\d+)/);
    if (statusMatch) {
      return statusMatch[1] === '2';
    }

    return null;
  } catch (err) {
    console.error(`Failed to check TikTok live status for ${username}:`, err);
    return null;
  }
}

async function checkAllAccounts(client) {
  const accounts = config.tiktokAccounts || [];
  const channelId = config.tiktokAnnounceChannelId;
  if (accounts.length === 0 || !channelId || channelId.startsWith('PUT_')) return;

  for (const account of accounts) {
    const username = account.username;
    if (!username) continue;

    const liveResult = await isUserLive(username);
    if (liveResult === null) continue; // couldn't determine — leave state untouched

    const state = knownLiveState.get(username) || { isLive: false, offlineStreak: 0 };

    if (liveResult) {
      const justWentLive = !state.isLive;
      state.isLive = true;
      state.offlineStreak = 0;
      knownLiveState.set(username, state);

      if (justWentLive) {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel) continue;

        const embed = new EmbedBuilder()
          .setTitle(`🔴 ${username} is now LIVE on TikTok!`)
          .setDescription(`[Click here to watch](https://www.tiktok.com/@${username}/live)`)
          .setColor('#FF0050')
          .setTimestamp();

        const pingRoleId = config.tiktokPingRoleId;
        const content =
          pingRoleId && !pingRoleId.startsWith('PUT_') ? `<@&${pingRoleId}>` : undefined;

        await channel.send({ content, embeds: [embed] }).catch(() => {});
      }
    } else if (state.isLive) {
      state.offlineStreak += 1;
      if (state.offlineStreak >= OFFLINE_CONFIRM_THRESHOLD) {
        state.isLive = false;
        state.offlineStreak = 0;
      }
      knownLiveState.set(username, state);
    }
  }
}

function startTikTokPolling(client) {
  setTimeout(() => checkAllAccounts(client), 10 * 1000);
  setInterval(() => checkAllAccounts(client), POLL_INTERVAL_MS);
}

module.exports = { startTikTokPolling };
