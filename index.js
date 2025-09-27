// Node 18+ (built-in fetch). Install: npm i discord.js
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");
const fs = require("fs");

// https://discord.com/api/oauth2/authorize?client_id=1421218704036855900&scope=bot%20applications.commands&permissions=68608

const DISCORD_TOKEN = String(fs.readFileSync("secrets/discord_token.txt", "utf-8"));
const KICKSTARTER_URL = String(fs.readFileSync("secrets/kickstarter_url.txt", "utf-8"));
const GOALS_STRING = String(fs.readFileSync("secrets/stretch_goals.txt", "utf-8")).split('\n');
const CHANNEL_NAME = String(fs.readFileSync("secrets/channel.txt", "utf-8"));
const DISCORD_CHANNEL_ID = null; // String(fs.readFileSync("secrets/discord_channel_id.txt", "utf-8"));
const POLL_SECONDS = 10;

const GOALS = [];
for (let i = 0; i < GOALS_STRING.length; i++) {
    const goalParts = GOALS_STRING[i].split(' ');
    const goalCost = Number.parseInt(goalParts[0]);
    if (!goalCost) {
        throw 'Could not parse goals.';
    }
    goalParts.shift();
    GOALS.push({
        cost: goalCost,
        text: goalParts.join(' '),
    });
}

if (!DISCORD_TOKEN || !KICKSTARTER_URL) {
  console.error("Set DISCORD_TOKEN and KICKSTARTER_URL env vars.");
  process.exit(1);
}

const STATE_FILE = "./state.json";
let state = { lastAmount: null };
try { state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch (_) {}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
let targetChannel = null;

client.once("clientReady", async () => {
  try {
    for (const [, guild] of client.guilds.cache) {
      const channels = await guild.channels.fetch();
      targetChannel = channels.find(c => c && c.type === ChannelType.GuildText && c.name === CHANNEL_NAME);
      if (targetChannel) break;
    }
    if (!targetChannel) throw new Error(`No #${CHANNEL_NAME} text channel found.`);

    console.log(`Logged in as ${client.user.tag}. Posting to #${targetChannel.name}`);
    // Initialize without posting
    const amt = await fetchFundingAmount(KICKSTARTER_URL);
    if (amt != null) {
      state.lastAmount = amt;
      saveState();
      console.log(`Initial funding: ${fmtMoney(amt)}.`);
    }
    setInterval(checkOnce, POLL_SECONDS * 1000);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});

// TODO say '$amount left until the next stretch goal! stretch goals loaded from txt file
// TODO channel name loaded from txt file

async function checkOnce() {
  try {
    const current = await fetchFundingAmount(KICKSTARTER_URL);
    if (current == null) return;

    const last = state.lastAmount;
    if (last == null) {
      state.lastAmount = current; saveState();
      return;
    }
    if (current !== last) {
      const delta = current - last;
      const sign = delta >= 0 ? "+" : "";
      const nextGoal = getNextGoal(current);
      const goalText = nextGoal ? `The next goal is ${nextGoal.text} at **${fmtMoney(nextGoal.cost)}**!` : 'All remaining support will go to improving the game!';
      await targetChannel.send(
        `New Kickstarter backer! Thank you! **${fmtMoney(current)}** (${sign}${fmtMoney(delta)}). ${goalText} <${KICKSTARTER_URL}>`
      );
      state.lastAmount = current; saveState();
      console.log(`Posted update: ${last} -> ${current}`);
    }
  } catch (e) {
    console.error("Poll error:", e.message);
  }
}

function getNextGoal(amount) {
    for (let i = 0; i < GOALS.length; i++) {
        if (amount < GOALS[i].cost) {
            return GOALS[i];
        }
    }
    return null;
}

async function fetchFundingAmount(projectUrl) {
  // 1) Try JSON stats endpoint first (fast, low overhead)
  try {
    const url = projectUrl + "/stats.json?v=1";
    const result = await fetch(url);
    if (!result.ok) {
        console.error(`Response status: ${result.status}`);
        return 0;
    }

    const json = await result.json();
    return json.project.pledged;
  } catch (err) {
    console.error(err);
  }

  return 0;
}

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (_) {}
}

function fmtMoney(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

client.login(DISCORD_TOKEN);
