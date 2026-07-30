const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const { announceNewChangelogEntries } = require('../utils/changelogAnnounce');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('post-changelog')
    .setDescription('Manually post any changelog entries that have not been announced yet'),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    await announceNewChangelogEntries(interaction.client);
    await interaction.editReply('Done — posted any new changelog entries (or there were none to post).');
  },
};
