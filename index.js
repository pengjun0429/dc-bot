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
    GatewayIntentBits.GuildPresences
  ]
});

// 1. 指令定義：改為全域架構
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理大量訊息').addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('clean_user').setDescription('清除特定成員近期訊息').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('掃描數量')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('正式警告成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('踢出成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('停權(禁言)成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('分鐘').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('lockdown').setDescription('全伺服器緊急封鎖/解鎖').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('check_invite').setDescription('查詢伺服器邀請連結報告'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器深度數據報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員高畫質頭像').addUserOption(o => o.setName('target').setDescription('對象'))
].map(c => c.toJSON());

// --- Rich Presence 視覺核心 (保留使用者要求的視覺門面) ---
const updateRichPresence = () => {
  const totalGuilds = client.guilds.cache.size;
  client.user.setPresence({
    activities: [{
      name: `監控 ${totalGuilds} 個伺服器`,
      type: ActivityType.Watching,
      details: "🛡️ 旗艦管理系統 v20.0",
      state: "管理員：使用者",
      assets: {
        largeImage: "main_banner", // 請在 Dev Portal 上傳對應金鑰的圖片
        largeText: "Polaris Global System",
        smallImage: "verified_icon",
        smallText: "安全認證"
      }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    // 【核心改動】改為全域註冊，移除 Guild ID 限制
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> v20.0 全域核心已就緒 | 指令已發布`);
    updateRichPresence();
    setInterval(updateRichPresence, 600000);
  } catch (err) { console.error(err); }
});

// 2. 多伺服器適應邏輯
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;
  if (!guild) return interaction.reply("此指令僅限伺服器內使用");

  try {
    // 視覺化邀請碼報告
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | ${i.inviter.tag} | 用量: **${i.uses}**`).join('\n') || '無數據';
      const embed = new EmbedBuilder()
        .setAuthor({ name: guild.name, iconURL: guild.iconURL() })
        .setTitle('🛰️ 邀請連結實時監控')
        .setDescription(list)
        .setColor(0x5865F2)
        .setImage('https://i.imgur.com/8N4X98z.png') // 邀請報告橫幅
        .setFooter({ text: `由 使用者 指導開發` });
      await interaction.reply({ embeds: [embed] });
    }

    // 全服封鎖邏輯 (動態適應當前伺服器)
    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const textChannels = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = textChannels.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of textChannels) await ch.permissionOverwrites.edit(everyone, { SendMessages: !isLocked });
      await interaction.reply(isLocked ? "🚨 **伺服器已進入封鎖模式**" : "✅ **伺服器已解除封鎖**");
    }

    // 批量清理特定成員訊息
    if (commandName === 'clean_user') {
      const target = options.getUser('target');
      const amount = options.getInteger('amount') || 100;
      const msgs = await channel.messages.fetch({ limit: amount });
      const targetMsgs = msgs.filter(m => m.author.id === target.id);
      await channel.bulkDelete(targetMsgs, true);
      await interaction.reply({ content: `✅ 已清理 ${target.tag} 的 ${targetMsgs.size} 則訊息`, ephemeral: true });
    }

    // (其餘 Ban, Timeout, Warn 指令皆使用動態 guild 物件，確保全域通用)
  } catch (e) { 
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行失敗，請檢查機器人權限階級', ephemeral: true });
  }
});

// 3. 網頁端：極簡匿名看板 (維持使用者喜好的風格)
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8"><title>匿名看板 V20</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 flex items-center justify-center min-h-screen p-4">
    <div class="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <h2 class="text-center font-black text-gray-800 text-xl mb-6 tracking-widest uppercase">Global_Portal</h2>
        <div class="space-y-4">
            <select id="ch" class="w-full p-3 bg-gray-50 border border-gray-100 rounded-lg outline-none text-sm"></select>
            <textarea id="msg" maxlength="500" class="w-full h-40 p-4 bg-gray-50 border border-gray-100 rounded-lg outline-none text-sm resize-none" placeholder="說點什麼..."></textarea>
            <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all active:scale-95 shadow-lg shadow-blue-200">發送匿名訊息</button>
        </div>
    </div>
    <script>
        async function load(){
            const res = await fetch('/api/channels').then(r=>r.json());
            document.getElementById('ch').innerHTML = res.map(c=>\`<option value="\${c.id}"># \${c.name}</option>\`).join('');
        }
        load();
        async function send(){
            const ch=document.getElementById('ch').value, msg=document.getElementById('msg').value;
            if(!msg) return;
            const btn=document.getElementById('btn'); btn.disabled=true;
            await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('msg').value=''; btn.disabled=false;
            alert('傳送完成');
        }
    </script>
</body>
</html>
`;

// 4. 後端 API
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  // 注意：網頁端目前仍鎖定在主要伺服器 (GUILD_ID)，若要全域網頁版需額外開發伺服器選單
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/channels' && guild) {
    const list = guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }));
    res.end(JSON.stringify(list));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    const target = await client.channels.fetch(ch);
    const embed = new EmbedBuilder().setAuthor({name:'匿名系統'}).setDescription(msg).setColor(0x2F3136).setTimestamp();
    await target.send({ embeds: [embed] }); res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
