const { getSticky, updateLastMessageId } = require('../utils/stickyManager');
const { addXpForMessage } = require('../utils/levelManager');
const config = require('../config.json');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const xpResult = addXpForMessage(message.author.id);
    if (xpResult && xpResult.leveledUp) {
      let targetChannel = message.channel;
      const levelUpChannelId = config.levelUpChannelId;
      if (levelUpChannelId && !levelUpChannelId.startsWith('PUT_')) {
        const fetched = await message.guild.channels.fetch(levelUpChannelId).catch(() => null);
        if (fetched) targetChannel = fetched;
      }

      await targetChannel
        .send(`Nice work ${message.author}, you just reached **level ${xpResult.newLevel}**! 🚀`)
        .catch(() => {});
    }

    const sticky = getSticky(message.channel.id);
    if (sticky) {
      if (sticky.lastMessageId) {
        const oldMsg = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
        if (oldMsg) await oldMsg.delete().catch(() => {});
      }
      const sent = await message.channel.send(`📌 ${sticky.content}`).catch(() => null);
      if (sent) updateLastMessageId(message.channel.id, sent.id);
    }
  },
};
