const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Post the application panel with a dropdown')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    const apps = config.applications || [];
    if (apps.length === 0) {
      return interaction.reply({ content: 'No applications are configured yet.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 Applications')
      .setDescription('Select which application you want to fill out below.')
      .setColor('#5865F2');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('application_select')
      .setPlaceholder('Select an application…')
      .addOptions(
        apps.map((app) => ({
          label: app.label,
          description: app.description,
          value: app.id,
          emoji: app.emoji || undefined,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Application panel posted.', ephemeral: true });
  },
};
