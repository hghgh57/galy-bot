const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Post a custom embed message')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((opt) =>
      opt.setName('title').setDescription('Embed title').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('description').setDescription('Embed description/body text').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('color').setDescription('Hex color, e.g. #5865F2').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('footer').setDescription('Footer text').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('image').setDescription('Image URL').setRequired(false)
    ),

  async execute(interaction) {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color') || '#5865F2';
    const footer = interaction.options.getString('footer');
    const image = interaction.options.getString('image');

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();

    if (footer) embed.setFooter({ text: footer });
    if (image) embed.setImage(image);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({ content: 'Embed posted.', ephemeral: true });
  },
};
