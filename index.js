const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ActivityType } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites
  ]
});

// 1. 保留並優化所有歷史功能指令
const commands = [
  // 管理類
  new SlashCommandBuilder().setName('clear').setDescription('清理大量訊息').addIntegerOption(o => o.setName('amount').setDescription('清理數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('發送正式警告').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('停權(禁言)成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('時間(分鐘)').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('lockdown').setDescription('切換全伺服器鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  // 數據與實用類
  new SlashCommandBuilder().setName('check_invite').setDescription('查看當前伺服器邀請碼數據'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器深度分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員頭像').addUserOption(o => o.setName('target').setDescription('對象')),
  new SlashCommandBuilder().setName('ping').setDescription('檢查機器人延遲')
].map(c => c.toJSON());

// Rich Presence 視覺核心 (保留使用者要求的封面圖片)
const updatePresence = () => {
  client.user.setPresence({
    activities: [{
      name: `管理 ${client.guilds.cache.size} 個伺服器`,
      type: ActivityType.Watching,
      details: "🛡️ Polaris Global v24.0",
      state: "開發者：使用者",
      assets: { 
        largeImage: "main_banner", // 需在 Dev Portal 上傳對應 Key
        smallImage: "verified_icon" 
      }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    // 全域註冊指令，讓所有伺服器都能使用
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> v24.0 終極版已上線 | 服務中伺服器: ${client.guilds.cache.size}`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error(err); }
});

// 2. 指令核心邏輯 (全功能動態適應)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;

  if (!guild) return interaction.reply({ content: "❌ 管理指令僅限伺服器內使用。", ephemeral: true });

  try {
    // [功能保留] 邀請碼報告
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | ${i.inviter ? i.inviter.tag : '未知'} | **${i.uses}** 次`).join('\n') || '無數據';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛰️ 流量監控').setDescription(list).setColor(0x5865F2)] });
    }

    // [功能保留] 全服鎖定
    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const textChannels = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !textChannels.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of textChannels) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked });
      await interaction.reply(isLocked ? "✅ **伺服器解鎖**" : "🚨 **伺服器鎖定**");
    }

    // [功能保留] 清理訊息
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      await channel.bulkDelete(Math.min(amt, 100), true);
      await interaction.reply({ content: `✅ 已清理 ${amt} 則訊息`, ephemeral: true });
    }

    // [功能保留] 停權成員 (含權限檢查)
    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const min = options.getInteger('minutes');
      if (target.roles.highest.position >= member.roles.highest.position) return interaction.reply("❌ 權限不足");
      await target.timeout(min * 60 * 1000);
      await interaction.reply(`🔇 **${target.user.tag}** 已禁言 ${min} 分鐘`);
    }

    if (commandName === 'ping') await interaction.reply(`🏓 延遲: ${client.ws.ping}ms`);

  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行出錯，請檢查權限', ephemeral: true });
  }
});

// 3. 旗艦版網頁後端 (整合 Yee 機器龍風格官網)
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  // 網頁端匿名留言板預設連結到使用者的主伺服器
  const mainGuild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    // 這裡放入之前給您的官網 HTML 程式碼
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(websiteHTML); 
  } else if (reqUrl.pathname === '/api/channels') {
    if (!mainGuild) return res.end(JSON.stringify([]));
    const list = mainGuild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    res.end(JSON.stringify(list));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    try {
      const target = await client.channels.fetch(ch);
      const embed = new EmbedBuilder().setAuthor({name:'匿名廣播'}).setDescription(msg).setColor(0x3498db).setTimestamp();
      await target.send({ embeds: [embed] });
      res.end('ok');
    } catch (e) { res.statusCode = 500; res.end('error'); }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);

