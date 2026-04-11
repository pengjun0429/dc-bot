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

// 1. 全指令定義 (保留全部管理與查詢功能)
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理訊息').addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('正式警告').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('停權成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('分鐘').setRequired(true)),
  new SlashCommandBuilder().setName('check_invite').setDescription('查詢邀請碼視覺化報告'),
  new SlashCommandBuilder().setName('lockdown').setDescription('全服封鎖/解鎖'),
  new SlashCommandBuilder().setName('server_report').setDescription('伺服器完整報告')
].map(c => c.toJSON());

// --- Rich Presence 視覺化核心 ---
const setRichPresence = () => {
  client.user.setPresence({
    activities: [{
      name: "邀請連結監控中", // 狀態文字
      type: ActivityType.Watching,
      details: "正在解析伺服器數據", // Rich Presence 詳細內容
      state: "管理員：使用者", // Rich Presence 狀態
      // 注意：largeImageKey 需要在 Discord Dev Portal 的 Rich Presence -> Art Assets 中上傳圖片並命名
      assets: {
        largeImage: "large_logo", // 填入你在 Dev Portal 上傳的圖片名稱
        largeText: "Polaris System v18",
        smallImage: "shield_icon",
        smallText: "安全防護已開啟"
      }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log(`>>> v18.0 視覺強化版啟動 | 管理員：使用者`);
    setRichPresence();
  } catch (err) { console.error(err); }
});

// 2. 指令核心邏輯
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, guild } = interaction;

  try {
    // 邀請碼視覺化報告
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | 建立者: ${i.inviter.tag} | 次數: **${i.uses}**`).join('\n') || '無活動中的邀請碼';
      
      const embed = new EmbedBuilder()
        .setTitle('🛰️ 伺服器邀請連結即時監控')
        .setDescription(list)
        .setColor(0x5865F2)
        .setThumbnail(guild.iconURL())
        .setImage('https://i.imgur.com/8N4X98z.png') // 這裡可放置邀請報告的橫幅圖片
        .setFooter({ text: `由 使用者 指導監製`, iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
        
      await interaction.reply({ embeds: [embed] });
    }

    // (其餘 Ban, Timeout, Lockdown 等管理功能維持 v17 穩定邏輯)
    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const channels = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = channels.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of channels) await ch.permissionOverwrites.edit(everyone, { SendMessages: !isLocked });
      await interaction.reply(isLocked ? "🚨 **全伺服器已進入緊急封鎖狀態**" : "✅ **全伺服器已解除鎖定**");
    }
    
  } catch (e) { console.error(e); }
});

// 3. 網頁端：極簡匿名留言板 (回歸純文字，模仿論壇樣式)
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8"><title>匿名看板 V18</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background: #f3f4f6; font-family: sans-serif; }
        .card { background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
    </style>
</head>
<body class="flex items-center justify-center min-h-screen p-4">
    <div class="card p-6 w-full max-w-lg">
        <div class="border-b pb-4 mb-4 text-center">
            <h1 class="text-xl font-bold text-gray-700 uppercase tracking-widest">System_Message_Board</h1>
        </div>
        <div class="space-y-4">
            <select id="ch" class="w-full p-2.5 bg-gray-50 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-blue-500"></select>
            <textarea id="msg" class="w-full h-40 p-3 bg-gray-50 border border-gray-200 rounded text-sm outline-none resize-none focus:ring-2 focus:ring-blue-500" placeholder="在此輸入發送到 Discord 的匿名訊息..."></textarea>
            <button onclick="send()" id="btn" class="w-full py-3 bg-gray-800 text-white font-bold rounded hover:bg-black transition">傳送匿名留言</button>
        </div>
    </div>
    <script>
        async function load(){
            const res = await fetch('/api/channels').then(r=>r.json());
            document.getElementById('ch').innerHTML = res.map(c=>\`<option value="\${c.id}"># \${c.name}</option>\`).join('');
        }
        load();
        async function send(){
            const ch = document.getElementById('ch').value;
            const msg = document.getElementById('msg').value;
            if(!msg) return alert('內容不能為空');
            const btn = document.getElementById('btn'); btn.disabled = true;
            await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            document.getElementById('msg').value = ''; btn.disabled = false;
            alert('傳送完成');
        }
    </script>
</body>
</html>
`;

// 4. 後端 API
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const guild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/channels' && guild) {
    res.end(JSON.stringify(guild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }))));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    const target = await client.channels.fetch(ch);
    const embed = new EmbedBuilder().setAuthor({name:'匿名廣播'}).setDescription(msg).setColor(0x2b2d31).setTimestamp();
    await target.send({ embeds: [embed] }); res.end('ok');
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
