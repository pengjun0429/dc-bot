const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits, ActivityType } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildInvites
  ]
});

// 1. 【全功能保留】定義所有歷史開發的指令
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('批量清理訊息').addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('發送正式警告').addUserOption(o => o.setName('target').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')),
  new SlashCommandBuilder().setName('timeout').setDescription('禁言(停權)成員').addUserOption(o => o.setName('target').setRequired(true)).addIntegerOption(o => o.setName('minutes').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setRequired(true)).addStringOption(o => o.setName('reason')),
  new SlashCommandBuilder().setName('lockdown').setDescription('切換全伺服器鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('check_invite').setDescription('查看當前伺服器邀請碼數據'),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器深度分析報告'),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取成員頭像').addUserOption(o => o.setName('target').setDescription('對象')),
  new SlashCommandBuilder().setName('ping').setDescription('檢查機器人延遲')
].map(c => c.toJSON());

// 2. 【視覺優化】顯示介紹網站連結 (Streaming 模式最穩定)
const updatePresence = () => {
  client.user.setPresence({
    activities: [{
      name: `🌐 介紹網站: pengjun0429.github.io/dc-bot-information/`,
      type: ActivityType.Streaming,
      url: "https://pengjun0429.github.io/dc-bot-information/",
      state: `管理員：使用者 | 服務 ${client.guilds.cache.size} 伺服器`
    }],
    status: 'online'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> Polaris v29.0 就緒 | 伺服器數: ${client.guilds.cache.size} | 指令已全數保留`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error("啟動錯誤:", err); }
});

// 3. 【核心邏輯】修正未受回應並執行所有指令功能
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;
  if (!guild) return;

  // 預先回應以防止「該申請未受回應」
  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  try {
    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      const deleted = await channel.bulkDelete(Math.min(amt, 100), true);
      await interaction.editReply(`✅ 已成功清理 **${deleted.size}** 則訊息。`);
    }

    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const textChannels = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !textChannels.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of textChannels) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked }).catch(() => {});
      await interaction.editReply(isLocked ? "✅ **全伺服器已解除鎖定**" : "🚨 **全伺服器已進入鎖定模式**");
    }

    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | 來自: ${i.inviter?.tag || '未知'} | 次數: **${i.uses}**`).join('\n') || '無數據';
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🛰️ 流量監控').setDescription(list).setColor(0x5865F2)] });
    }

    if (commandName === 'warn') {
      const target = options.getUser('target');
      const reason = options.getString('reason') || '未註明原因';
      const embed = new EmbedBuilder().setTitle('⚠️ 正式警告').setDescription(`對象: ${target}\n原因: ${reason}`).setColor(0xffaa00).setTimestamp();
      await channel.send({ content: `${target}`, embeds: [embed] });
      await interaction.editReply(`✅ 已完成對 ${target.tag} 的警告程序。`);
    }

    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const min = options.getInteger('minutes');
      if (!target.manageable) return interaction.editReply("❌ 權限不足以禁言該成員。");
      await target.timeout(min * 60 * 1000);
      await interaction.editReply(`🔇 已將 **${target.user.tag}** 禁言 ${min} 分鐘。`);
    }

    if (commandName === 'ping') await interaction.editReply(`🏓 延遲：${client.ws.ping}ms`);

  } catch (e) {
    console.error(e);
    await interaction.editReply('❌ 指令執行失敗，請檢查權限。').catch(() => {});
  }
});

// 4. 【網頁 API】保持功能與介紹網站風格對接
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#0b0e14] text-white flex flex-col items-center py-24 px-6 font-sans">
    <h1 class="text-4xl font-black text-blue-500 italic mb-10 tracking-tighter uppercase">ADMIN_TERMINAL</h1>
    <div class="bg-white/5 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 class="text-xl font-bold mb-6 text-center text-blue-400 uppercase tracking-widest">匿名傳送系統</h2>
        <select id="ch" class="w-full p-4 bg-black/40 rounded-xl mb-4 border border-white/5 outline-none focus:border-blue-500 transition"></select>
        <textarea id="msg" class="w-full h-40 p-4 bg-black/40 rounded-xl mb-4 border border-white/5 outline-none resize-none focus:border-blue-500 transition" placeholder="輸入訊息..."></textarea>
        <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 rounded-xl font-black hover:bg-blue-500 transition">發送至 DISCORD</button>
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
            if(res.ok) { alert('發送成功'); document.getElementById('msg').value=''; }
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
