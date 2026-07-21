const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { createTicket, claimTicket, closeTicket } = require('../utils/ticketManager');
const {
  savePartial,
  getPartial,
  clearPartial,
  buildApplicationEmbed,
} = require('../utils/applicationManager');
const config = require('../config.json');

function buildQuestionModal(customId, title, questions) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(title);

  questions.forEach((question, i) => {
    const input = new TextInputBuilder()
      .setCustomId(`q${i}`)
      .setLabel(question.slice(0, 45)) // Discord label limit is 45 chars
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  });

  return modal;
}

async function submitApplication(interaction, appId, appConfig, fullAnswers) {
  clearPartial(interaction.user.id, appId);

  const embed = buildApplicationEmbed(interaction.member, appConfig, fullAnswers);
  const reviewChannel = await interaction.guild.channels
    .fetch(appConfig.reviewChannelId)
    .catch(() => null);

  if (reviewChannel) await reviewChannel.send({ embeds: [embed] });
  await interaction.reply({ content: '✅ Your application has been submitted!', ephemeral: true });
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // Slash commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      // Dropdown: ticket category selection -> create ticket
      if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
        const categoryId = interaction.values[0];
        await createTicket(interaction, categoryId);
        return;
      }

      // Dropdown: application selection -> show first modal (questions 1-5)
      if (interaction.isStringSelectMenu() && interaction.customId === 'application_select') {
        const appId = interaction.values[0];
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const firstFive = appConfig.questions.slice(0, 5);
        const modal = buildQuestionModal(
          `application_modal1_${appId}`,
          appConfig.label.slice(0, 45),
          firstFive
        );

        await interaction.showModal(modal);
        return;
      }

      // Buttons
      if (interaction.isButton()) {
        if (interaction.customId === 'ticket_claim') {
          await claimTicket(interaction);
          return;
        }

        if (interaction.customId === 'ticket_close') {
          await closeTicket(interaction, null);
          return;
        }

        if (interaction.customId === 'ticket_close_reason') {
          const modal = new ModalBuilder()
            .setCustomId('ticket_close_reason_modal')
            .setTitle('Close Ticket');

          const reasonInput = new TextInputBuilder()
            .setCustomId('close_reason_input')
            .setLabel('Reason for closing')
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('e.g. Issue resolved')
            .setRequired(true)
            .setMaxLength(500);

          modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
          await interaction.showModal(modal);
          return;
        }

        // Continue button -> opens the second modal (question 6+)
        // Buttons ARE allowed to show a modal, unlike modal submissions.
        if (interaction.customId.startsWith('application_continue_')) {
          const appId = interaction.customId.replace('application_continue_', '');
          const appConfig = (config.applications || []).find((a) => a.id === appId);

          if (!appConfig) {
            return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
          }

          const remaining = appConfig.questions.slice(5);
          const modal2 = buildQuestionModal(
            `application_modal2_${appId}`,
            appConfig.label.slice(0, 45),
            remaining
          );
          await interaction.showModal(modal2);
          return;
        }
      }

      // Modal submit: ticket close with reason
      if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_reason_modal') {
        const reason = interaction.fields.getTextInputValue('close_reason_input');
        await closeTicket(interaction, reason);
        return;
      }

      // Modal submit: application step 1 (questions 1-5)
      // Discord does NOT allow showing a modal directly from a modal submission,
      // so instead we save the answers and reply with a "Continue" button.
      // Clicking that button (a normal button interaction) is allowed to open modal 2.
      if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal1_')) {
        const appId = interaction.customId.replace('application_modal1_', '');
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const answers = [];
        for (let i = 0; i < 5; i++) {
          answers.push(interaction.fields.getTextInputValue(`q${i}`));
        }
        savePartial(interaction.user.id, appId, answers);

        const remaining = appConfig.questions.slice(5);

        if (remaining.length === 0) {
          const fullAnswers = getPartial(interaction.user.id, appId);
          await submitApplication(interaction, appId, appConfig, fullAnswers);
          return;
        }

        const continueRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`application_continue_${appId}`)
            .setLabel('Continue Application')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({
          content: 'Almost done! Click below to answer the last question.',
          components: [continueRow],
          ephemeral: true,
        });
        return;
      }

      // Modal submit: application step 2 (final question) -> combine + submit
      if (interaction.isModalSubmit() && interaction.customId.startsWith('application_modal2_')) {
        const appId = interaction.customId.replace('application_modal2_', '');
        const appConfig = (config.applications || []).find((a) => a.id === appId);

        if (!appConfig) {
          return interaction.reply({ content: 'That application no longer exists.', ephemeral: true });
        }

        const firstFive = getPartial(interaction.user.id, appId) || [];
        const remainingCount = appConfig.questions.length - 5;
        const lastAnswers = [];
        for (let i = 0; i < remainingCount; i++) {
          lastAnswers.push(interaction.fields.getTextInputValue(`q${i}`));
        }

        const fullAnswers = [...firstFive, ...lastAnswers];
        await submitApplication(interaction, appId, appConfig, fullAnswers);
        return;
      }
    } catch (err) {
      console.error('Error handling interaction:', err);
      const errMsg = { content: 'Something went wrong handling that action.', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errMsg).catch(() => {});
      } else {
        await interaction.reply(errMsg).catch(() => {});
      }
    }
  },
};
