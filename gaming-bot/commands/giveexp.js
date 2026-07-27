const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { adjustXp } = require('../utils/levelManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('give-xp')
    .setDescription('Give a member XP')
    .addUserOption((opt) => opt.setName('user').setDescription('Who to give XP to').setRequired(true))
    .addIntegerOption((opt) =>
      opt.setName('amount').setDescription('How much XP to give').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    const result = adjustXp(target.id, amount);

    await interaction.reply(
      `✅ Gave ${target} **${amount} XP**. They are now level **${result.newLevel}** (${result.newXp} XP into that level).`
    );
  },
};
