const { getSticky, updateLastMessageId } = require('../utils/stickyManager');
const config = require('../config.json');

// Deletes any message that pings a member holding the configured
// "Ping Protection" role. Staff (Manage Server permission) are exempt so
// they can still ping protected members when genuinely needed. Returns
// true if the message was removed, so the caller can stop processing it.
async function enforcePingProtection(message) {
  const roleId = config.pingProtectionRoleId;
  if (!roleId || roleId.startsWith('PUT_')) return false;
  if (!message.mentions.users.size) return false;

  const protectedHit = message.mentions.members?.some((m) => m.roles.cache.has(roleId));
  if (!protectedHit) return false;

  if (message.member?.permissions.has('ManageGuild')) return false;

  await message.delete().catch((err) => {
    console.error('Failed to delete message pinging a ping-protected member:', err);
  });

  await message.channel
    .send({ content: `${message.author}, that member has ping protection — you can't ping them.` })
    .then((notice) => setTimeout(() => notice.delete().catch(() => {}), 6000))
    .catch(() => {});

  return true;
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    if (await enforcePingProtection(message)) return;

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
