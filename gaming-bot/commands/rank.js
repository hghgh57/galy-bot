const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, getRank, xpForNextLevel } = require('../utils/levelManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Check your (or someone else\'s) level and XP')
    .addUserOption((opt) =>
      opt.setName('user').setDescription('Whose rank to check').setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user') || interaction.user;
    const stats = getUser(target.id);
    const needed = xpForNextLevel(stats.level);
    const rank = getRank(target.id);

    const barLength = 20;
    const filled = Math.round((stats.xp / needed) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    const embed = new EmbedBuilder()
      .setTitle(`📊 ${target.username}'s Rank`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: 'Level', value: `${stats.level}`, inline: true },
        { name: 'Rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
        { name: 'XP', value: `${stats.xp} / ${needed}`, inline: true },
        { name: 'Progress', value: `\`${bar}\``, inline: false }
      )
      .setColor('#5865F2');

    await interaction.reply({ embeds: [embed] });
  },
};
