const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { loadGiveaways, endGiveaway } = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gend')
    .setDescription('End a giveaway early and pick winners now')
    .addStringOption((opt) =>
      opt.setName('message_id').setDescription('The giveaway message ID').setRequired(true)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const messageId = interaction.options.getString('message_id');
    const giveaways = loadGiveaways();
    const giveaway = giveaways[messageId];

    if (!giveaway) {
      return interaction.reply({ content: 'Giveaway not found.', ephemeral: true });
    }
    if (giveaway.ended) {
      return interaction.reply({ content: 'That giveaway has already ended.', ephemeral: true });
    }

    await interaction.reply({ content: 'Ending giveaway now…', ephemeral: true });
    await endGiveaway(interaction.client, messageId);
  },
};
