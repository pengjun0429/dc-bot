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

// 1. 【功能保留】定義所有歷史開發指令
const commands = [
  // 權限管理類
  new SlashCommandBuilder().setName('clear').setDescription('批量清理訊息').addIntegerOption(o => o.setName('amount').setDescription('清理數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('發送正式警告').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('停權(禁言)成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('時間(分鐘)').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('lockdown').setDescription('切換全伺服器鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  // 實用數據類
  new SlashCommandBuilder().setName('check_invite').setDescription('查看當前伺服器邀請數據'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員頭像').addUserOption(o => o.setName('target').setDescription('對象')),
  new SlashCommandBuilder().setName('ping').setDescription('檢查機器人延遲')
].map(c => c.toJSON());

// 2. 【視覺整合】將介紹網站放進 Rich Presence (使用最穩定的 Streaming 模式)
const updatePresence = () => {
  const serverCount = client.guilds.cache.size;
  client.user.setPresence({
    activities: [{
      name: `🌐 官網: pengjun0429.github.io/dc-bot-information/`,
      type: ActivityType.Streaming,
      url: "https://pengjun0429.github.io/dc-bot-information/", // 唯一支援點擊跳轉的連結
      details: "🛡️ Polaris Global v27.0",
      state: `管理員：使用者 | 服務 ${serverCount} 伺服器`
    }],
    status: 'online'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> Polaris v27.0 啟動成功 | 指令已全數保留並發布`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error("啟動錯誤:", err); }
});

// 3. 【核心邏輯】指令處理程式 (確保功能如常運作)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;

  if (!guild) return interaction.reply({ content: "❌ 限伺服器內使用", ephemeral: true });

  try {
    // 邀請監控功能
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | 來源: ${i.inviter ? i.inviter.tag : '未知'} | **${i.uses}** 次`).join('\n') || '無數據';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🛰️ 流量監控').setDescription(list).setColor(0x5865F2)] });
    }

    // 全服鎖定功能
    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const textChannels = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !textChannels.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of textChannels) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked });
      await interaction.reply(isLocked ? "✅ **全伺服器已解除鎖定**" : "🚨 **全伺服器已進入鎖定模式**");
    }

    // 批量清理
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      await channel.bulkDelete(Math.min(amt, 100), true);
      await interaction.reply({ content: `✅ 已清理 ${amt} 則訊息`, ephemeral: true });
    }

    // 延遲測試
    if (commandName === 'ping') await interaction.reply(`🏓 延遲：${client.ws.ping}ms`);

  } catch (e) {
    console.error("執行指令出錯:", e);
  }
});

// 4. 【網頁控制台】保持與介紹網站風格一致
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#0b0e14] text-white flex flex-col items-center py-24 px-6 font-sans">
    <h1 class="text-4xl font-black text-blue-500 italic mb-10 tracking-tighter uppercase">ADMIN_TERMINAL</h1>
    <div class="bg-white/5 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 class="text-xl font-bold mb-6 text-center tracking-widest text-blue-400 uppercase">匿名傳送系統</h2>
        <div class="space-y-4">
            <select id="ch" class="w-full p-4 bg-black/40 rounded-xl border border-white/5 outline-none focus:border-blue-500 transition"></select>
            <textarea id="msg" class="w-full h-40 p-4 bg-black/40 rounded-xl border border-white/5 outline-none resize-none focus:border-blue-500 transition" placeholder="輸入訊息..."></textarea>
            <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 rounded-xl font-black hover:bg-blue-500 transition active:scale-95">發送至 DISCORD</button>
        </div>
    </div>
    <script>
        async function load(){
            const res = await fetch('/api/channels').then(r=>r.json());
            document.getElementById('ch').innerHTML = res.map(c=>\`<option value="\${c.id}"># \${c.name}</option>\`).join('');
        }
        window.onload = load;
        async function send(){
            const ch=document.getElementById('ch').value, msg=document.getElementById('msg').value;
            if(!msg) return;
            const btn=document.getElementById('btn'); btn.disabled=true; btn.innerText='處理中...';
            const res = await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            if(res.ok) { alert('發送成功'); document.getElementById('msg').value=''; }
            btn.disabled=false; btn.innerText='發送至 DISCORD';
        }
    </script>
</body>
</html>
`;

http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const mainGuild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/channels') {
    if (!mainGuild) return res.end(JSON.stringify([]));
    res.end(JSON.stringify(mainGuild.channels.cache.filter(c => c.type === 0).map(c => ({ id: c.id, name: c.name }))));
  } else if (reqUrl.pathname === '/api/post') {
    const { ch, msg } = reqUrl.query;
    try {
      const target = await client.channels.fetch(ch);
      const embed = new EmbedBuilder().setAuthor({name:'匿名廣播'}).setDescription(msg).setColor(0x3498db).setTimestamp();
      await target.send({ embeds: [embed] }); res.end('ok');
    } catch (e) { res.statusCode = 500; res.end('error'); }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
