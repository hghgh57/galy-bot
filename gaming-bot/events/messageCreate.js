const { getSticky, updateLastMessageId } = require('../utils/stickyManager');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    const sticky = getSticky(message.channel.id);
    if (!sticky) return;

    if (sticky.lastMessageId) {
      const oldMsg = await message.channel.messages.fetch(sticky.lastMessageId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    }

    const sent = await message.channel.send(`📌 ${sticky.content}`).catch(() => null);
    if (sent) updateLastMessageId(message.channel.id, sent.id);
  },
};
