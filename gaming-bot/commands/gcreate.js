const { SlashCommandBuilder } = require('discord.js');
const { isMod } = require('../utils/permissions');
const {
  loadGiveaways,
  saveGiveaways,
  parseDuration,
  buildGiveawayEmbed,
  buildJoinRow,
  scheduleGiveaway,
} = require('../utils/giveawayManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gcreate')
    .setDescription('Start a giveaway')
    .addStringOption((opt) =>
      opt.setName('prize').setDescription('What are you giving away?').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('duration')
        .setDescription('How long it runs, e.g. 30s, 10m, 1h, 1d')
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1)
    ),

  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }

    const prize = interaction.options.getString('prize');
    const durationStr = interaction.options.getString('duration');
    const winnerCount = interaction.options.getInteger('winners');

    const ms = parseDuration(durationStr);
    if (!ms) {
      return interaction.reply({
        content: 'Invalid duration format. Use something like `30s`, `10m`, `1h`, or `1d`.',
        ephemeral: true,
      });
    }

    const endTimestamp = Date.now() + ms;
    const embed = buildGiveawayEmbed(prize, endTimestamp, winnerCount, 0);

    await interaction.reply({ embeds: [embed], components: [buildJoinRow()] });
    const message = await interaction.fetchReply();

    const giveaways = loadGiveaways();
    giveaways[message.id] = {
      prize,
      winnerCount,
      endTimestamp,
      channelId: interaction.channel.id,
      entrants: [],
      ended: false,
    };
    saveGiveaways(giveaways);

    scheduleGiveaway(interaction.client, message.id, ms);
  },
};
