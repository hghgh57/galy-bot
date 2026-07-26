const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { loadGiveaways, saveGiveaways, pickWinners } = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('greroll')
    .setDescription('Reroll a winner for an ended giveaway')
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

    if (!giveaway || !giveaway.ended) {
      return interaction.reply({
        content: 'That giveaway was not found or has not ended yet.',
        ephemeral: true,
      });
    }

    const newWinners = pickWinners(giveaway.entrants, giveaway.winnerCount);
    giveaway.winners = newWinners;
    giveaways[messageId] = giveaway;
    saveGiveaways(giveaways);

    if (newWinners.length === 0) {
      return interaction.reply({ content: 'No valid entrants to reroll a winner from.' });
    }

    await interaction.reply({
      content: `🎉 New winner(s) for **${giveaway.prize}**: ${newWinners.map((id) => `<@${id}>`).join(', ')}!`,
    });
  },
};
