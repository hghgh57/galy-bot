const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
} = require('discord.js');

const {
  createTicket,
  claimTicket,
  closeTicket,
} = require('../utils/ticketManager');

const {
  hasApplied,
  clearApplied,
  buildDecisionRow,
} = require('../utils/applicationManager');

const {
  startDmApplication,
  handleDmApplicationStart,
  handleDmApplicationQuestion,
  handleDmApplicationCancel,
} = require('../utils/dmApplication');

const config = require('../config.json');

const {
  loadGiveaways,
  saveGiveaways,
  buildGiveawayEmbed,
} = require('../utils/giveawayManager');

const {
  OPTION_LABELS,
  buildStarsRow,
} = require('../utils/vouchManager');

const {
  ensureStaffEmbed,
} = require('../utils/staffTracker');


/* =========================================================
   SUPPORT CHECK
========================================================= */

function isSupport(member) {
  const roleIds = config.supportRoleIds || [];

  return roleIds.some(
    (id) =>
      id &&
      !id.startsWith('PUT_') &&
      member.roles.cache.has(id)
  );
}


/* =========================================================
   RESET NORMAL TICKET DROPDOWN
========================================================= */

async function resetTicketDropdown(message) {
  if (!message) return;

  const categories = config.categories || [];

  if (!categories.length) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_category_select')
    .setPlaceholder('Select a ticket category…')
    .addOptions(
      categories
        .slice(0, 25)
        .map((cat) => ({
          label: String(cat.label || cat.id).slice(0, 100),

          description: String(
            cat.description || 'Open a ticket'
          ).slice(0, 100),

          value: String(cat.id),

          emoji: cat.emoji || undefined,
        }))
    );

  await message
    .edit({
      components: [
        new ActionRowBuilder().addComponents(menu),
      ],
    })
    .catch((err) => {
      console.error(
        'Failed to reset ticket dropdown:',
        err
      );
    });
}


/* =========================================================
   RESET SERVICE TICKET DROPDOWN
========================================================= */

async function resetServiceTicketDropdown(message) {
  if (!message) return;

  const categories = config.serviceCategories || [];

  if (!categories.length) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('service_ticket_category_select')
    .setPlaceholder('Select a service…')
    .addOptions(
      categories
        .slice(0, 25)
        .map((cat) => ({
          label: String(cat.label || cat.id).slice(0, 100),

          description: String(
            cat.description || 'Open a service ticket'
          ).slice(0, 100),

          value: String(cat.id),

          emoji: cat.emoji || undefined,
        }))
    );

  await message
    .edit({
      components: [
        new ActionRowBuilder().addComponents(menu),
      ],
    })
    .catch((err) => {
      console.error(
        'Failed to reset service ticket dropdown:',
        err
      );
    });
}


/* =========================================================
   RESET APPLICATION DROPDOWN
========================================================= */

async function resetApplicationDropdown(message) {
  if (!message) return;

  const apps = config.applications || [];

  if (!apps.length) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId('application_select')
    .setPlaceholder('Select an application…')
    .addOptions(
      apps
        .slice(0, 25)
        .map((app) => ({
          label: String(
            app.label || app.id
          ).slice(0, 100),

          description: String(
            app.description || 'Apply here'
          ).slice(0, 100),

          value: String(app.id),

          emoji: app.emoji || undefined,
        }))
    );

  await message
    .edit({
      components: [
        new ActionRowBuilder().addComponents(menu),
      ],
    })
    .catch((err) => {
      console.error(
        'Failed to reset application dropdown:',
        err
      );
    });
}


/* =========================================================
   BUILD TICKET QUESTIONS MODAL
========================================================= */

function buildQuestionsModal(category) {
  const questions = category.questions || [];

  const modal = new ModalBuilder()
    .setCustomId(
      `ticket_questions_modal_${category.id}`
    )
    .setTitle(
      String(
        category.label || 'Ticket'
      ).slice(0, 45)
    );

  questions
    .slice(0, 5)
    .forEach((question, i) => {
      const input = new TextInputBuilder()
        .setCustomId(`q_${i}`)
        .setLabel(
          String(question).slice(0, 45)
        )
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(
        new ActionRowBuilder().addComponents(input)
      );
    });

  return modal;
}


/* =========================================================
   FIND NORMAL OR SERVICE CATEGORY
========================================================= */

function findTicketCategory(categoryId) {
  const normalCategory = (
    config.categories || []
  ).find(
    (category) =>
      String(category.id) === String(categoryId)
  );

  if (normalCategory) {
    return normalCategory;
  }

  const serviceCategory = (
    config.serviceCategories || []
  ).find(
    (category) =>
      String(category.id) === String(categoryId)
  );

  return serviceCategory || null;
}


/* =========================================================
   MAIN INTERACTION EVENT
========================================================= */

module.exports = {
  name: 'interactionCreate',

  async execute(interaction) {

    console.log(
      `[INTERACTION] ${
        interaction.customId ||
        interaction.commandName ||
        interaction.type
      }`
    );

    try {

      /* =====================================================
         SLASH COMMANDS
      ===================================================== */

      if (interaction.isChatInputCommand()) {

        const command =
          interaction.client.commands.get(
            interaction.commandName
          );

        if (!command) return;

        await command.execute(interaction);

        return;
      }


      /* =====================================================
         NORMAL / SERVICE TICKET DROPDOWNS
      ===================================================== */

      if (
        interaction.isStringSelectMenu() &&
        (
          interaction.customId ===
            'ticket_category_select' ||

          interaction.customId ===
            'service_ticket_category_select' ||

          interaction.customId ===
            'service_ticket_select'
        )
      ) {

        const selectedCategoryId =
          interaction.values?.[0];

        if (!selectedCategoryId) {

          return interaction.reply({
            content:
              '❌ No ticket category was selected.',
            ephemeral: true,
          });

        }

        const category =
          findTicketCategory(
            selectedCategoryId
          );

        if (!category) {

          if (
            interaction.customId ===
            'ticket_category_select'
          ) {
            await resetTicketDropdown(
              interaction.message
            );
          } else {
            await resetServiceTicketDropdown(
              interaction.message
            );
          }

          return interaction.reply({
            content:
              '❌ That ticket category could not be found.',
            ephemeral: true,
          });
        }


        /* =================================================
           DETERMINE WHICH PANEL WAS USED
        ================================================= */

        const isServicePanel =
          interaction.customId ===
            'service_ticket_category_select' ||
          interaction.customId ===
            'service_ticket_select';


        /* =================================================
           RESET PANEL IMMEDIATELY
           
           This is important because Discord select menus
           visually keep the selected value until the
           original message is edited.
        ================================================= */

        if (isServicePanel) {

          await resetServiceTicketDropdown(
            interaction.message
          );

        } else {

          await resetTicketDropdown(
            interaction.message
          );
        }


        /* =================================================
           CATEGORY HAS QUESTIONS
        ================================================= */

        if (
          Array.isArray(category.questions) &&
          category.questions.length > 0
        ) {

          await interaction.showModal(
            buildQuestionsModal(category)
          );

          return;
        }


        /* =================================================
           CATEGORY HAS NO QUESTIONS
        ================================================= */

        await createTicket(
          interaction,
          selectedCategoryId
        );

        return;
      }


      /* =====================================================
         APPLICATION DM QUESTION MODAL
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'dmapp_question_'
        )
      ) {

        await handleDmApplicationQuestion(
          interaction
        );

        return;
      }


      /* =====================================================
         NORMAL / SERVICE TICKET QUESTIONS MODAL
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'ticket_questions_modal_'
        )
      ) {

        const categoryId =
          interaction.customId.replace(
            'ticket_questions_modal_',
            ''
          );

        const category =
          findTicketCategory(categoryId);

        if (!category) {

          return interaction.reply({
            content:
              '❌ Unknown ticket category.',
            ephemeral: true,
          });
        }

        const questions =
          Array.isArray(category.questions)
            ? category.questions.slice(0, 5)
            : [];

        const answers = questions.map(
          (question, i) => ({
            question,

            answer:
              interaction.fields.getTextInputValue(
                `q_${i}`
              ),
          })
        );

        await createTicket(
          interaction,
          categoryId,
          answers
        );

        return;
      }


      /* =====================================================
         STAFF TRACKER SELECT
      ===================================================== */

      if (
        interaction.isUserSelectMenu() &&
        interaction.customId ===
          'staff_tracker_select'
      ) {

        await interaction.deferUpdate();

        const results = [];

        for (
          const userId of interaction.values
        ) {

          const created =
            await ensureStaffEmbed(
              interaction.guild,
              userId
            );

          results.push(
            `${
              created
                ? '✅ Created'
                : 'ℹ️ Already exists'
            } — <@${userId}>`
          );
        }

        await interaction.editReply({
          content:
            `Staff tracker setup:\n${results.join(
              '\n'
            )}`,

          components: [],
        });

        return;
      }


      /* =====================================================
         APPLICATION SELECT
      ===================================================== */

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          'application_select'
      ) {

        const appId =
          interaction.values?.[0];

        if (!appId) {

          await resetApplicationDropdown(
            interaction.message
          );

          return interaction.reply({
            content:
              '❌ No application was selected.',
            ephemeral: true,
          });
        }

        const appConfig =
          (config.applications || []).find(
            (app) =>
              String(app.id) ===
              String(appId)
          );

        /* =================================================
           INVALID APPLICATION
        ================================================= */

        if (!appConfig) {

          await resetApplicationDropdown(
            interaction.message
          );

          return interaction.reply({
            content:
              '❌ That application no longer exists.',
            ephemeral: true,
          });
        }


        /* =================================================
           CHECK PENDING APPLICATION
        ================================================= */

        if (
          hasApplied(
            interaction.user.id,
            appId
          )
        ) {

          await resetApplicationDropdown(
            interaction.message
          );

          return interaction.reply({
            content:
              '❌ You already have a pending application for this. Please wait for a decision before applying again.',
            ephemeral: true,
          });
        }


        /* =================================================
           RESET APPLICATION PANEL
           
           This happens BEFORE attempting the DM.
           Therefore the dropdown never gets stuck on the
           user's previous selection.
        ================================================= */

        await resetApplicationDropdown(
          interaction.message
        );


        /* =================================================
           SEND APPLICATION TO DMS
        ================================================= */

        const started =
          await startDmApplication(
            interaction.guild,
            interaction.user,
            appId,
            appConfig
          );


        /* =================================================
           DM FAILED
        ================================================= */

        if (!started) {

          return interaction.reply({
            content:
              "❌ I couldn't DM you. Please enable **Direct Messages from server members** and try again.",
            ephemeral: true,
          });
        }


        /* =================================================
           DM SENT
        ================================================= */

        return interaction.reply({
          content:
            '📬 Check your DMs to fill out the application!',
          ephemeral: true,
        });
      }


      /* =====================================================
         BUTTONS
      ===================================================== */

      if (interaction.isButton()) {


        /* =================================================
           DM APPLICATION START
        ================================================= */

        if (
          interaction.customId.startsWith(
            'dmapp_start_'
          )
        ) {

          const applicationData =
            interaction.customId.replace(
              'dmapp_start_',
              ''
            );

          await handleDmApplicationStart(
            interaction,
            applicationData
          );

          return;
        }


        /* =================================================
           DM APPLICATION CANCEL
        ================================================= */

        if (
          interaction.customId.startsWith(
            'dmapp_cancel_'
          )
        ) {

          const applicationData =
            interaction.customId.replace(
              'dmapp_cancel_',
              ''
            );

          await handleDmApplicationCancel(
            interaction,
            applicationData
          );

          return;
        }


        /* =================================================
           VOUCH NO
        ================================================= */

        if (
          interaction.customId.startsWith(
            'vouch_no_'
          )
        ) {

          const rest =
            interaction.customId.replace(
              'vouch_no_',
              ''
            );

          const [
            requesterId,
            optionValue,
          ] = rest.split('|');

          const optionLabel =
            OPTION_LABELS[
              optionValue
            ] || optionValue;


          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  'No worries — thanks for letting us know!'
                )
                .setColor('#ED4245'),
            ],

            components: [],
          });


          const logChannelId =
            config.vouchLogChannelId;

          if (
            logChannelId &&
            !logChannelId.startsWith('PUT_')
          ) {

            const logChannel =
              await interaction.client.channels
                .fetch(logChannelId)
                .catch(() => null);

            if (logChannel) {

              const logEmbed =
                new EmbedBuilder()
                  .setTitle('Vouch Declined')
                  .addFields(
                    {
                      name: 'From',
                      value:
                        `${interaction.user.tag} (${interaction.user.id})`,
                      inline: true,
                    },
                    {
                      name: 'Requested by',
                      value:
                        `<@${requesterId}>`,
                      inline: true,
                    },
                    {
                      name: 'Category',
                      value:
                        optionLabel,
                      inline: true,
                    }
                  )
                  .setColor('#ED4245')
                  .setTimestamp();

              await logChannel
                .send({
                  embeds: [logEmbed],
                })
                .catch(() => {});
            }
          }

          return;
        }


        /* =================================================
           VOUCH YES
        ================================================= */

        if (
          interaction.customId.startsWith(
            'vouch_yes_'
          )
        ) {

          const rest =
            interaction.customId.replace(
              'vouch_yes_',
              ''
            );

          const [
            requesterId,
            optionValue,
          ] = rest.split('|');

          await interaction.update({
            embeds: [
              new EmbedBuilder()
                .setDescription(
                  'Awesome! How many stars would you like to give? (1-5)'
                )
                .setColor('#5865F2'),
            ],

            components: [
              buildStarsRow(
                requesterId,
                optionValue
              ),
            ],
          });

          return;
        }


        /* =================================================
           VOUCH STARS
        ================================================= */

        if (
          interaction.customId.startsWith(
            'vouch_stars_'
          )
        ) {

          const rest =
            interaction.customId.replace(
              'vouch_stars_',
              ''
            );

          const [
            requesterId,
            optionValue,
            stars,
          ] = rest.split('|');

          const modal =
            new ModalBuilder()
              .setCustomId(
                `vouch_comment_modal_${requesterId}|${optionValue}|${stars}`
              )
              .setTitle(
                'Leave a Comment'
              );

          const commentInput =
            new TextInputBuilder()
              .setCustomId(
                'vouch_comment_input'
              )
              .setLabel(
                'Comment (optional)'
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setRequired(false)
              .setMaxLength(500);

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              commentInput
            )
          );

          await interaction.showModal(
            modal
          );

          return;
        }


        /* =================================================
           GIVEAWAY JOIN
        ================================================= */

        if (
          interaction.customId ===
          'giveaway_join'
        ) {

          const giveaways =
            loadGiveaways();

          const giveaway =
            giveaways[
              interaction.message.id
            ];

          if (
            !giveaway ||
            giveaway.ended
          ) {

            return interaction.reply({
              content:
                'This giveaway has ended.',
              ephemeral: true,
            });
          }

          if (
            !Array.isArray(
              giveaway.entrants
            )
          ) {
            giveaway.entrants = [];
          }

          const userId =
            interaction.user.id;

          const idx =
            giveaway.entrants.indexOf(
              userId
            );

          if (idx === -1) {

            giveaway.entrants.push(
              userId
            );

            saveGiveaways(
              giveaways
            );

            await interaction.reply({
              content:
                '🎉 You entered the giveaway!',
              ephemeral: true,
            });

          } else {

            giveaway.entrants.splice(
              idx,
              1
            );

            saveGiveaways(
              giveaways
            );

            await interaction.reply({
              content:
                'You left the giveaway.',
              ephemeral: true,
            });
          }

          const updatedEmbed =
            buildGiveawayEmbed(
              giveaway.prize,
              giveaway.endTimestamp,
              giveaway.winnerCount,
              giveaway.entrants.length
            );

          await interaction.message
            .edit({
              embeds: [
                updatedEmbed,
              ],
            })
            .catch(() => {});

          return;
        }


        /* =================================================
           REACTION ROLES
        ================================================= */

        if (
          interaction.customId.startsWith(
            'rr_'
          )
        ) {

          const roleId =
            interaction.customId.replace(
              'rr_',
              ''
            );

          const member =
            interaction.member;

          await interaction.deferReply({
            ephemeral: true,
          });

          const role =
            await interaction.guild.roles
              .fetch(roleId)
              .catch(() => null);

          if (!role) {

            return interaction.editReply({
              content:
                '❌ That role no longer exists.',
            });
          }

          const configEntry =
            (
              config.reactionRoles?.roles ||
              []
            ).find(
              (r) =>
                r.roleId === roleId
            );

          const displayName =
            configEntry?.label ||
            role.name;


          if (
            member.roles.cache.has(
              roleId
            )
          ) {

            try {

              await member.roles.remove(
                roleId
              );

              await interaction.editReply({
                content:
                  `Removed the **${displayName}** role.`,
              });

            } catch (err) {

              console.error(
                `Failed to remove role ${roleId}:`,
                err
              );

              await interaction.editReply({
                content:
                  `❌ I couldn't remove the **${displayName}** role — check that my bot role is above it.`,
              });
            }

          } else {

            try {

              await member.roles.add(
                roleId
              );

              await interaction.editReply({
                content:
                  `Gave you the **${displayName}** role!`,
              });

            } catch (err) {

              console.error(
                `Failed to add role ${roleId}:`,
                err
              );

              await interaction.editReply({
                content:
                  `❌ I couldn't give you the **${displayName}** role — check that my bot role is above it.`,
              });
            }
          }

          return;
        }


        /* =================================================
           TICKET CLAIM
        ================================================= */

        if (
          interaction.customId ===
          'ticket_claim'
        ) {

          await claimTicket(
            interaction
          );

          return;
        }


        /* =================================================
           TICKET CLOSE
        ================================================= */

        if (
          interaction.customId ===
          'ticket_close'
        ) {

          await closeTicket(
            interaction,
            null
          );

          return;
        }


        /* =================================================
           CLOSE WITH REASON
        ================================================= */

        if (
          interaction.customId ===
          'ticket_close_reason'
        ) {

          const modal =
            new ModalBuilder()
              .setCustomId(
                'ticket_close_reason_modal'
              )
              .setTitle(
                'Close Ticket'
              );

          const reasonInput =
            new TextInputBuilder()
              .setCustomId(
                'close_reason_input'
              )
              .setLabel(
                'Reason for closing'
              )
              .setStyle(
                TextInputStyle.Paragraph
              )
              .setPlaceholder(
                'e.g. Issue resolved'
              )
              .setRequired(true)
              .setMaxLength(500);

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              reasonInput
            )
          );

          await interaction.showModal(
            modal
          );

          return;
        }


        /* =================================================
           APPLICATION ACCEPT / DENY
        ================================================= */

        if (
          interaction.customId.startsWith(
            'app_accept_'
          ) ||
          interaction.customId.startsWith(
            'app_deny_'
          )
        ) {

          const isAccept =
            interaction.customId.startsWith(
              'app_accept_'
            );

          const prefix =
            isAccept
              ? 'app_accept_'
              : 'app_deny_';

          const rest =
            interaction.customId.replace(
              prefix,
              ''
            );

          /*
            Format:

            app_accept_USERID_APPID
            app_deny_USERID_APPID

            Split only at the FIRST underscore.
          */

          const separator =
            rest.indexOf('_');

          if (
            separator === -1
          ) {

            return interaction.reply({
              content:
                '❌ Invalid application button.',
              ephemeral: true,
            });
          }

          const applicantId =
            rest.slice(
              0,
              separator
            );

          const appId =
            rest.slice(
              separator + 1
            );


          /* =================================================
             STAFF CHECK
          ================================================= */

          if (
            !interaction.member ||
            !isSupport(
              interaction.member
            )
          ) {

            return interaction.reply({
              content:
                'Only staff can accept or deny applications.',
              ephemeral: true,
            });
          }


          /* =================================================
             APPLICATION CONFIG
          ================================================= */

          const appConfig =
            (
              config.applications ||
              []
            ).find(
              (app) =>
                String(app.id) ===
                String(appId)
            );

          const label =
            appConfig
              ? appConfig.label
              : 'Application';


          /* =================================================
             GET ORIGINAL EMBED
          ================================================= */

          const originalEmbed =
            interaction.message
              .embeds[0];

          if (!originalEmbed) {

            return interaction.reply({
              content:
                '❌ Could not find the application embed.',
              ephemeral: true,
            });
          }


          /* =================================================
             UPDATE APPLICATION
          ================================================= */

          const updatedEmbed =
            EmbedBuilder
              .from(originalEmbed)
              .setColor(
                isAccept
                  ? '#57F287'
                  : '#ED4245'
              )
              .setFooter({
                text:
                  `${
                    isAccept
                      ? 'Accepted'
                      : 'Denied'
                  } by ${
                    interaction.user.tag
                  }`,
              });


          await interaction.update({
            embeds: [
              updatedEmbed,
            ],

            components: [
              buildDecisionRow(
                applicantId,
                appId,
                true
              ),
            ],
          });


          /* =================================================
             CLEAR PENDING APPLICATION
          ================================================= */

          clearApplied(
            applicantId,
            appId
          );


          /* =================================================
             DM APPLICANT
          ================================================= */

          const applicant =
            await interaction.client.users
              .fetch(applicantId)
              .catch(() => null);

          if (applicant) {

            await applicant
              .send(
                isAccept
                  ? `🎉 Your **${label}** application in **${interaction.guild.name}** was accepted!`
                  : `Your **${label}** application in **${interaction.guild.name}** was denied.`
              )
              .catch((err) => {
                console.error(
                  `Could not DM applicant ${applicantId}:`,
                  err.message
                );
              });
          }

          return;
        }
      }


      /* =====================================================
         CLOSE REASON MODAL
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId ===
          'ticket_close_reason_modal'
      ) {

        const reason =
          interaction.fields
            .getTextInputValue(
              'close_reason_input'
            );

        await closeTicket(
          interaction,
          reason
        );

        return;
      }


      /* =====================================================
         VOUCH COMMENT MODAL
      ===================================================== */

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'vouch_comment_modal_'
        )
      ) {

        const rest =
          interaction.customId.replace(
            'vouch_comment_modal_',
            ''
          );

        const [
          requesterId,
          optionValue,
          stars,
        ] = rest.split('|');

        const comment =
          interaction.fields
            .getTextInputValue(
              'vouch_comment_input'
            ) ||
          'No comment left.';

        const optionLabel =
          OPTION_LABELS[
            optionValue
          ] ||
          optionValue;

        const starsNum =
          parseInt(
            stars,
            10
          );

        const safeStars =
          Math.max(
            1,
            Math.min(
              5,
              Number.isNaN(
                starsNum
              )
                ? 5
                : starsNum
            )
          );

        const starDisplay =
          '⭐'.repeat(
            safeStars
          ) +
          '☆'.repeat(
            5 - safeStars
          );


        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                '✅ Thanks for your vouch!'
              )
              .setColor(
                '#57F287'
              ),
          ],

          components: [],
        });


        const vouchChannelId =
          config.vouchChannelId;

        if (
          vouchChannelId &&
          !vouchChannelId.startsWith(
            'PUT_'
          )
        ) {

          const vouchChannel =
            await interaction.client.channels
              .fetch(
                vouchChannelId
              )
              .catch(
                () => null
              );

          if (vouchChannel) {

            const requester =
              await interaction.client.users
                .fetch(
                  requesterId
                )
                .catch(
                  () => null
                );

            const vouchEmbed =
              new EmbedBuilder()
                .setTitle(
                  '⭐ New Vouch'
                )
                .addFields(
                  {
                    name:
                      'Vouch For',

                    value:
                      requester
                        ? `${requester}`
                        : `<@${requesterId}>`,

                    inline: true,
                  },

                  {
                    name:
                      'From',

                    value:
                      `${interaction.user}`,

                    inline: true,
                  },

                  {
                    name:
                      'Category',

                    value:
                      optionLabel,

                    inline: true,
                  },

                  {
                    name:
                      'Rating',

                    value:
                      starDisplay,
                  },

                  {
                    name:
                      'Comment',

                    value:
                      comment,
                  }
                )
                .setColor(
                  '#FEE75C'
                )
                .setTimestamp();


            await vouchChannel
              .send({
                embeds: [
                  vouchEmbed,
                ],
              })
              .catch(
                () => {}
              );
          }
        }

        return;
      }

    } catch (err) {

      console.error(
        'Error handling interaction:',
        err
      );

      try {

        if (
          interaction.deferred ||
          interaction.replied
        ) {

          await interaction.followUp({
            content:
              '❌ Something went wrong handling that action.',
            ephemeral: true,
          });

        } else {

          await interaction.reply({
            content:
              '❌ Something went wrong handling that action.',
            ephemeral: true,
          });
        }

      } catch (_) {}
    }
  },
};
