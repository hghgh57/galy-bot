const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription("See the bot's update history"),

  async execute(interaction) {
    const entries = config.changelog || [];

    if (entries.length === 0) {
      return interaction.reply({ content: 'No changelog entries yet.', ephemeral: true });
    }

    const sorted = [...entries].sort((a, b) => b.version - a.version);
    const lines = sorted.map((entry) => `**Update ${entry.version}** — ${entry.title}`);

    const embed = new EmbedBuilder()
      .setTitle('📜 Changelog')
      .setDescription(lines.join('\n'))
      .setColor('#5865F2');

    await interaction.reply({ embeds: [embed] });
  },
};
