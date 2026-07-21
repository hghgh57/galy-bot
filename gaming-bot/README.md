# Gaming Bot — Tickets, Welcome, Staff Applications

## Features
- `/ticket-panel` — dropdown with 6 categories: Support, Giveaway Sponsor, Giveaway
  Claim, Spawner Sell, Spawner Buy, Partnership. Each opens a private ticket channel
  with Claim/Close/Close-with-Reason buttons and auto-transcripts.
- Welcome messages — posts in a channel when someone joins.
- `/apply` — Staff Application with 6 questions (answered across a form + one
  follow-up popup, since Discord caps forms at 5 fields each).

## Deploy (GitHub + Railway)

### 1. Discord application
1. discord.com/developers/applications → **New Application**
2. **Bot** tab → **Reset Token** → save it
3. Turn ON **Server Members Intent** (Privileged Gateway Intents)
4. **General Information** → copy **Application ID**
5. **OAuth2 → URL Generator** → scopes `bot` + `applications.commands` →
   permissions: Manage Channels, Send Messages, Embed Links, Attach Files, Read
   Message History, Manage Roles → invite the bot with the generated URL

### 2. GitHub
1. New **private** repo
2. Go to `https://github.com/YOUR_USERNAME/YOUR_REPO/upload/main`
3. Upload everything in this project
4. Commit

### 3. Railway
1. **New Project → Deploy from GitHub repo** → select it
2. If it fails to build with "could not determine how to build the app" — go to
   **Settings → Root Directory** and set it to the folder name your files landed
   in (check the error message, it tells you what folder it found)
3. **Variables** tab → add `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
4. Once it's running (check Deployments logs for `✅ Logged in as...`), go to the
   **Console** tab and run:
   ```
   node deploy-commands.js
   ```
   This registers `/ticket-panel`, `/close`, and `/apply`.

### 4. Configure `config.json` on GitHub
Fill in the placeholder IDs (right-click things in Discord with Developer Mode on
to copy their ID):
- `supportRoleIds` — role(s) that can see/manage tickets
- `ticketCategoryId` — Discord category channel new tickets get created under
- `transcriptLogChannelId` — where closed-ticket transcripts get posted
- `welcomeChannelId` — where join messages post
- `applications[0].reviewChannelId` — where submitted staff applications post

Commit after each edit — Railway redeploys automatically within a minute or two.

### 5. Post the ticket panel
In Discord, type `/ticket-panel` in any channel (needs Manage Channels permission).

## Notes
- Ticket ownership tracked via channel topic — no database needed.
- `/apply` walks through 5 questions in a popup, then shows a **Continue
  Application** button for the 6th (Discord doesn't allow chaining two popups
  directly — the button in between is required, not optional).
- If a build fails with a "could not determine how to build" error on Railway,
  it's almost always the Root Directory setting — see step 3 above.
