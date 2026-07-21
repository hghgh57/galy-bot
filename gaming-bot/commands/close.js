const { SlashCommandBuilder } = require('discord.js');
const { closeTicket } = require('../utils/ticketManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket channel')
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for closing').setRequired(false)
    ),

  async execute(interaction) {
    const reason = interaction.options.getString('reason');
    await closeTicket(interaction, reason);
  },
};
