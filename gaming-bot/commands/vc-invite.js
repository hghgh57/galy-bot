const { SlashCommandBuilder } = require('discord.js');
const { getOwner } = require('../utils/voiceChannels');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('vc-invite')
    .setDescription('Invite someone to your Join-to-Create voice channel')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to invite').setRequired(true)),

  async execute(interaction) {
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: 'You need to be in your voice channel to invite someone.',
        ephemeral: true,
      });
    }

    const ownerId = getOwner(voiceChannel.id);
    if (!ownerId) {
      return interaction.reply({ content: "This isn't a Join-to-Create voice channel.", ephemeral: true });
    }

    if (ownerId !== interaction.user.id) {
      return interaction.reply({ content: 'Only the channel owner can invite people.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');

    if (target.bot) {
      return interaction.reply({ content: "You can't invite a bot.", ephemeral: true });
    }

    await voiceChannel.permissionOverwrites
      .edit(target.id, { ViewChannel: true, Connect: true })
      .catch((err) => {
        console.error('Failed to grant VC access:', err);
      });

    await interaction.reply({ content: `✅ Invited ${target} to **${voiceChannel.name}**.`, ephemeral: true });

    await target
      .send(
        `🔊 ${interaction.user.tag} invited you to join their voice channel **${voiceChannel.name}** in **${interaction.guild.name}**! Hop into the server and click the channel to join.`
      )
      .catch(() => {});
  },
};
