const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const config = require('../config.json');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Post the ticket creation panel with a category dropdown'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle(config.panel.title)
      .setDescription(config.panel.description)
      .setColor(config.panel.color || '#5865F2')
      .setFooter({ text: config.panel.footer || '' });

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Select a ticket category…')
      .addOptions(
        config.categories.map((cat) => ({
          label: cat.label,
          description: cat.description,
          value: cat.id,
          emoji: cat.emoji || undefined,
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: 'Ticket panel posted.', ephemeral: true });
  },
};
