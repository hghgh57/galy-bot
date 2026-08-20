const { ChannelType, PermissionsBitField } = require('discord.js');
const config = require('../config.json');
const { registerChannel, unregisterChannel, isTempChannel } = require('../utils/voiceChannels');

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const triggerChannelId = config.joinToCreateChannelId;
    if (!triggerChannelId || triggerChannelId.startsWith('PUT_')) return;

    // Someone joined the "Join to Create" trigger channel — spin up a
    // private VC just for them and move them straight into it.
    if (newState.channelId === triggerChannelId && oldState.channelId !== triggerChannelId) {
      const guild = newState.guild;
      const member = newState.member;

      const parentId =
        config.joinToCreateCategoryId && !config.joinToCreateCategoryId.startsWith('PUT_')
          ? config.joinToCreateCategoryId
          : newState.channel?.parentId;

      try {
        const channel = await guild.channels.create({
          name: `${member.displayName}'s VC`,
          type: ChannelType.GuildVoice,
          parent: parentId || undefined,
          permissionOverwrites: [
            {
              // Hidden from everyone by default — only the owner (and
              // anyone they explicitly invite via /vc-invite) can see or
              // join it.
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
            },
            {
              id: member.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
                PermissionsBitField.Flags.ManageChannels,
                PermissionsBitField.Flags.MoveMembers,
              ],
            },
            {
              id: guild.members.me.id,
              allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.ManageChannels,
              ],
            },
          ],
        });

        registerChannel(channel.id, member.id);
        await member.voice.setChannel(channel).catch(() => {});
      } catch (err) {
        console.error('Failed to create join-to-create VC:', err);
      }
    }

    // Someone left a temp channel — delete it once it's completely empty.
    if (oldState.channelId && isTempChannel(oldState.channelId)) {
      const channel = oldState.channel;
      if (channel && channel.members.size === 0) {
        unregisterChannel(channel.id);
        await channel.delete().catch(() => {});
      }
    }
  },
};
