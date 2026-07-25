const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLeaderboard } = require('../utils/levelManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('See the top members by level and XP'),

  async execute(interaction) {
    const top = getLeaderboard(10);

    if (top.length === 0) {
      return interaction.reply({ content: 'No one has earned any XP yet!', ephemeral: true });
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map((entry, i) => {
      const medal = medals[i] || `**${i + 1}.**`;
      return `${medal} <@${entry.userId}> — Level ${entry.level} (${entry.xp} XP)`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🏆 Leaderboard')
      .setDescription(lines.join('\n'))
      .setColor('#F5C518');

    await interaction.reply({ embeds: [embed] });
  },
};
