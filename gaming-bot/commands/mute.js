const { SlashCommandBuilder } = require('discord.js');
const config = require('../config.json');
const { isMod } = require('../utils/permissions');
const { logModAction } = require('../utils/modLog');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute or unmute a member (toggles if they are already muted)')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to mute/unmute').setRequired(true))
    .addStringOption((opt) => opt.setName('reason').setDescription('Reason').setRequired(false)),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const mutedRoleId = config.mutedRoleId;
    if (!mutedRoleId || mutedRoleId.startsWith('PUT_')) {
      return interaction.reply({ content: 'The muted role has not been configured yet.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);

    if (!member) {
      return interaction.reply({ content: 'Could not find that member in this server.', ephemeral: true });
    }

    const alreadyMuted = member.roles.cache.has(mutedRoleId);

    if (alreadyMuted) {
      await member.roles.remove(mutedRoleId).catch(() => {});
      await interaction.reply(`🔊 ${target} has been unmuted.`);
      await logModAction(interaction.guild, { action: 'Unmute', moderator: interaction.user, target, reason });
    } else {
      await member.roles.add(mutedRoleId).catch(() => {});
      await interaction.reply(`🔇 ${target} has been muted.`);
      await logModAction(interaction.guild, { action: 'Mute', moderator: interaction.user, target, reason });
    }
  },
};
