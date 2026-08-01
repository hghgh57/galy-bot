const config = require('../config.json');
const { isMod } = require('./permissions');
const { logModAction } = require('./modLog');

/**
 * Checks if a message was sent in a configured trap channel.
 * If so, deletes the message and times out the author for 1 day (unless they're staff).
 * Returns true if the message was handled as a trap trigger.
 */
async function checkTrap(message) {
  const trapChannelIds = config.trapChannelIds || [];
  if (!trapChannelIds.includes(message.channel.id)) return false;

  // Never trap staff — protects mods/admins from accidentally timing themselves out.
  if (message.member && isMod(message.member)) return false;

  await message.delete().catch(() => {});

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (message.member) {
    await message.member.timeout(ONE_DAY_MS, 'Sent a message in a trap channel').catch(() => {});
  }

  await logModAction(message.guild, {
    action: 'Trap Channel Triggered',
    moderator: message.client.user,
    target: message.author,
    reason: `Posted in trap channel <#${message.channel.id}> — timed out for 1 day`,
  });

  return true;
}

module.exports = { checkTrap };
