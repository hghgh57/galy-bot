// In-memory tracking for "Join to Create" temporary voice channels — not
// persisted across restarts. A restart just means any channels created
// before it stop being auto-deleted/ownership-checked once people leave;
// they'd need manual cleanup that one time.
const ownedChannels = new Map(); // channelId -> ownerId

function registerChannel(channelId, ownerId) {
  ownedChannels.set(channelId, ownerId);
}

function unregisterChannel(channelId) {
  ownedChannels.delete(channelId);
}

function isTempChannel(channelId) {
  return ownedChannels.has(channelId);
}

function getOwner(channelId) {
  return ownedChannels.get(channelId);
}

module.exports = { registerChannel, unregisterChannel, isTempChannel, getOwner };
