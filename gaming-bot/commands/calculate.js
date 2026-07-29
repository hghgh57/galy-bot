const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const SAFE_EXPRESSION = /^[0-9+\-*/(). \s]+$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calculate')
    .setDescription('Evaluate a basic math expression')
    .addStringOption((opt) =>
      opt.setName('expression').setDescription('e.g. (5 + 3) * 2').setRequired(true)
    ),

  async execute(interaction) {
    const expression = interaction.options.getString('expression');

    if (!SAFE_EXPRESSION.test(expression)) {
      return interaction.reply({
        content: 'Only numbers and `+ - * / ( )` are allowed in the expression.',
        ephemeral: true,
      });
    }

    let result;
    try {
      result = Function(`"use strict"; return (${expression})`)();
    } catch (err) {
      return interaction.reply({ content: "That expression couldn't be evaluated — check your syntax.", ephemeral: true });
    }

    if (typeof result !== 'number' || !Number.isFinite(result)) {
      return interaction.reply({ content: 'That expression did not produce a valid number.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🧮 Calculator')
      .addFields(
        { name: 'Expression', value: `\`${expression}\``, inline: false },
        { name: 'Result', value: `\`${result}\``, inline: false }
      )
      .setColor('#5865F2');

    await interaction.reply({ embeds: [embed] });
  },
};
