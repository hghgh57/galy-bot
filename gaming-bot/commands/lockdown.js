const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Lock or unlock this channel')
    .addSubcommand((sub) => sub.setName('lock').setDescription('Prevent @everyone from sending messages here'))
    .addSubcommand((sub) => sub.setName('unlock').setDescription('Allow @everyone to send messages here again')),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const everyoneRole = interaction.guild.roles.everyone;

    if (sub === 'lock') {
      await interaction.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: false });
      await interaction.reply('🔒 This channel has been locked.');
      await logModAction(interaction.guild, {
        action: 'Channel Locked',
        moderator: interaction.user,
        target: interaction.user,
        reason: `#${interaction.channel.name}`,
      });
      return;
    }

    if (sub === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(everyoneRole, { SendMessages: null });
      await interaction.reply('🔓 This channel has been unlocked.');
      await logModAction(interaction.guild, {
        action: 'Channel Unlocked',
        moderator: interaction.user,
        target: interaction.user,
        reason: `#${interaction.channel.name}`,
      });
      return;
    }
  },
};
