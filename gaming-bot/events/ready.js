const { startTikTokPolling } = require('../utils/tiktokLive');
const { rearmActiveGiveaways } = require('../utils/giveawayManager');
const { startDailyGiveawayLoop } = require('../utils/dailyGiveaway');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);
    startTikTokPolling(client);
    rearmActiveGiveaways(client);
    startDailyGiveawayLoop(client);

    const statuses = [
      { name: 'voiddd', type: 2 },
      { name: 'stalking voidz toilet', type: 3 },
    ];

    let index = 0;
    client.user.setActivity(statuses[index].name, { type: statuses[index].type });

    setInterval(() => {
      index = (index + 1) % statuses.length;
      client.user.setActivity(statuses[index].name, { type: statuses[index].type });
    }, 10 * 1000);
  },
};
