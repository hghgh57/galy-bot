const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

const { isAdmin } = require('../utils/permissions');
const config = require('../config.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('service-tickets')
    .setDescription('Post the service ticket panel (building/digging/regears)'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({
        content: 'You do not have permission to use this command.',
        ephemeral: true
      });
    }

    const categories = config.serviceCategories || [];

    if (!categories.length) {
      return interaction.reply({
        content: 'No serviceCategories are configured in config.json.',
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.servicePanel?.title || 'Services')
      .setDescription(
        config.servicePanel?.description ||
        'Select a service below to open a ticket.'
      )
      .setColor(config.servicePanel?.color || '#5865F2');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('service_ticket_category_select')
      .setPlaceholder('Select a service…')
      .addOptions(
        categories.map((cat) => ({
          label: cat.label,
          description: (cat.description || '').slice(0, 100),
          value: cat.id,
          emoji: cat.emoji || undefined
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.channel.send({
      embeds: [embed],
      components: [row]
    });

    await interaction.reply({
      content: 'Service ticket panel posted.',
      ephemeral: true
    });
  }
};
