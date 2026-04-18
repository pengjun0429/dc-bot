const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ActivityType } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

// 檢查必要的環境變數，防止啟動崩潰
if (!process.env.TOKEN || !process.env.CLIENT_ID || !process.env.GUILD_ID) {
  console.error("❌ 錯誤：缺失必要的環境變數 (TOKEN, CLIENT_ID, 或 GUILD_ID)");
  process.exit(1); 
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildInvites
  ]
});

// 1. 【全功能保留】指令定義
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('批量清理訊息').addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('發送正式警告').addUserOption(o => o.setName('target').setRequired(true)).addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('timeout').setDescription('禁言成員').addUserOption(o => o.setName('target').setRequired(true)).addIntegerOption(o => o.setName('minutes').setRequired(true)),
  new SlashCommandBuilder().setName('lockdown').setDescription('切換全伺服器鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('check_invite').setDescription('查看邀請數據'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成深度分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取頭像').addUserOption(o => o.setName('target')),
  new SlashCommandBuilder().setName('ping').setDescription('延遲測試')
].map(c => c.toJSON());

// 2. 【視覺狀態】
const updatePresence = () => {
  try {
    client.user.setPresence({
      activities: [{
        name: `🌐 官網: pengjun0429.github.io/dc-bot-information/`,
        type: ActivityType.Streaming,
        url: "https://pengjun0429.github.io/dc-bot-information/",
        state: `管理員：使用者 | v30.0`
      }],
      status: 'online'
    });
  } catch (e) { console.error("狀態更新失敗:", e); }
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> Polaris v30.0 穩定版上線`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error("REST 註冊錯誤:", err); }
});

// 3. 【核心邏輯】解決「申請未受回應」與「Status 1」
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;
  if (!guild) return;

  // 統一使用 deferReply 增加處理時間
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  try {
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      const deleted = await channel.bulkDelete(Math.min(amt, 100), true);
      await interaction.editReply(`✅ 已清理 ${deleted.size} 則訊息`);
    }

    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const chs = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !chs.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of chs) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked }).catch(() => {});
      await interaction.editReply(isLocked ? "✅ **伺服器已解除鎖定**" : "🚨 **伺服器已鎖定**");
    }

    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | ${i.inviter?.tag || '未知'} | **${i.uses}** 次`).join('\n') || '無數據';
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🛰️ 流量監控').setDescription(list).setColor(0x5865F2)] });
    }

    if (commandName === 'ping') await interaction.editReply(`🏓 延遲：${client.ws.ping}ms`);

  } catch (e) {
    console.error("指令執行崩潰:", e);
    if (interaction.deferred) await interaction.editReply("❌ 執行失敗，請檢查權限設定。").catch(() => {});
  }
});

// 4. 【網頁 API】
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#0b0e14] text-white flex flex-col items-center py-24 font-sans">
    <h1 class="text-4xl font-black text-blue-500 italic mb-10 tracking-tighter">ADMIN_TERMINAL</h1>
    <div class="bg-white/5 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 class="text-xl font-bold mb-6 text-center text-blue-400">匿名傳送系統</h2>
        <select id="ch" class="w-full p-4 bg-black/40 rounded-xl mb-4 border border-white/5 outline-none"></select>
        <textarea id="msg" class="w-full h-40 p-4 bg-black/40 rounded-xl mb-4 border border-white/5 outline-none" placeholder="輸入訊息..."></textarea>
        <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 rounded-xl font-black">發送至 DISCORD</button>
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
            const btn=document.getElementById('btn'); btn.disabled=true;
            const res = await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            if(res.ok) { alert('成功'); document.getElementById('msg').value=''; }
            btn.disabled=false;
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
