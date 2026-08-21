const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { parseTopic } = require('../utils/ticketManager');
const { incrementStat } = require('../utils/staffTracker');
const config = require('../config.json');

function getRoleIdsForCategory(categoryId) {
  const isApplication = (config.applications || []).some((a) => a.id === categoryId);
  return isApplication ? config.applicationTicketRoleIds || [] : config.ticketRoleIds || [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-rename')
    .setDescription('Rename the current ticket channel')
    .addStringOption((opt) => opt.setName('name').setDescription('New channel name').setRequired(true)),

  async execute(interaction) {
    const meta = parseTopic(interaction.channel.topic);
    if (!meta) {
      return interaction.reply({ content: 'This does not look like a ticket channel.', ephemeral: true });
    }

    const member = interaction.member;
    const roleIds = getRoleIdsForCategory(meta.categoryId);
    const isTicketStaff = roleIds.some((id) => id && !id.startsWith('PUT_') && member.roles.cache.has(id));
    if (!isTicketStaff && !member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return interaction.reply({ content: 'You do not have permission to rename this ticket.', ephemeral: true });
    }

    const newName = interaction.options
      .getString('name')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 90);

    if (!newName) {
      return interaction.reply({ content: 'That name is not valid.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      await interaction.channel.setName(newName);
    } catch (err) {
      console.error('Failed to rename ticket channel:', err);
      return interaction.editReply({
        content: '❌ Could not rename the channel — Discord may be rate-limiting channel renames right now. Try again shortly.',
      });
    }

    await interaction.editReply({ content: `✅ Ticket renamed to **${newName}**.` });

    incrementStat(interaction.guild, interaction.user.id, 'ticketsRenamed').catch((err) => {
      console.error('Failed to update staff tracker for ticket rename:', err);
    });
  },
};
