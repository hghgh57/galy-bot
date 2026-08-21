const { SlashCommandBuilder, ActionRowBuilder, UserSelectMenuBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staff-tracker-setup')
    .setDescription('Select staff members to create tracker embeds for'),

  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const menu = new UserSelectMenuBuilder()
      .setCustomId('staff_tracker_select')
      .setPlaceholder('Select staff members…')
      .setMinValues(1)
      .setMaxValues(25);

    await interaction.reply({
      content: 'Select all the staff members you want a tracker embed created for:',
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true,
    });
  },
};
