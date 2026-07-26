const { startTikTokPolling } = require('../utils/tiktokLive');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('voidddddddd', { type: 2 });
    startTikTokPolling(client);
  },
};
