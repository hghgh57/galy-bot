const { getSticky, updateLastMessageId } = require('../utils/stickyManager');
const { addXpForMessage } = require('../utils/levelManager');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const xpResult = addXpForMessage(message.author.id);
    if (xpResult && xpResult.leveledUp) {
      await message.channel
        .send(`🎉 ${message.author} leveled up to **level ${xpResult.newLevel}**!`)
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
