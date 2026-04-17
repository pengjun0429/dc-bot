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

// 1. 保留以前全部指令功能
const commands = [
  // 管理類
  new SlashCommandBuilder().setName('clear').setDescription('批量清理訊息').addIntegerOption(o => o.setName('amount').setDescription('清理數量(1-100)').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
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

// --- Rich Presence 視覺設置 (含介紹網站按鈕) ---

const updatePresence = () => {
  const serverCount = client.guilds.cache.size;
  
  client.user.setPresence({
    activities: [{
      // 將介紹網址直接寫在名稱中
      name: `🌐 介紹網站: pengjun0429.github.io/dc-bot-information/`,
      type: ActivityType.Streaming, 
      url: "https://pengjun0429.github.io/dc-bot-information/", // 這裡填入介紹網站網址
      details: `🛡️ Polaris v25.5 | 監控 ${serverCount} 伺服器`,
      state: "管理員：使用者"
    }],
    status: 'online' // 直播模式建議使用 online (紫色圖示)
  });
};
      assets: {
        largeImage: "main_banner", 
        largeText: "Polaris System",
        smallImage: "verified_icon",
        smallText: "核心已授權"
      }
    }],
    status: 'dnd'
  });
};

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    // 全域註冊指令 (Global Commands)
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`>>> v25.0 終極版啟動成功 | 已連接 ${client.guilds.cache.size} 個伺服器`);
    updatePresence();
    setInterval(updatePresence, 600000); 
  } catch (err) { console.error(err); }
});

// 2. 指令核心邏輯 (功能一個都沒少)
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel, member } = interaction;

  if (!guild) return interaction.reply({ content: "❌ 管理指令僅限伺服器內使用。", ephemeral: true });

  try {
    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `🎫 \`${i.code}\` | 來自: ${i.inviter ? i.inviter.tag : '未知'} | 次數: **${i.uses}**`).join('\n') || '無數據';
      const embed = new EmbedBuilder().setTitle('🛰️ 流量監控').setDescription(list).setColor(0x5865F2).setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'lockdown') {
      const everyone = guild.roles.everyone;
      const chs = guild.channels.cache.filter(c => c.type === 0);
      const isLocked = !chs.first().permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      for (const [id, ch] of chs) await ch.permissionOverwrites.edit(everyone, { SendMessages: isLocked });
      await interaction.reply(isLocked ? "✅ **伺服器解鎖完成**" : "🚨 **伺服器鎖定完成**");
    }

    if (commandName === 'clear') {
      const amt = options.getInteger('amount');
      await channel.bulkDelete(Math.min(amt, 100), true);
      await interaction.reply({ content: `✅ 已清理 ${amt} 則訊息`, ephemeral: true });
    }

    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const min = options.getInteger('minutes');
      if (!target.manageable) return interaction.reply("❌ 權限不足以對該成員執行此操作。");
      await target.timeout(min * 60 * 1000);
      await interaction.reply(`🔇 **${target.user.tag}** 已禁言 ${min} 分鐘。`);
    }

    if (commandName === 'ping') await interaction.reply(`🏓 延遲：${client.ws.ping}ms`);

  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行出錯，請確認權限設定。', ephemeral: true });
  }
});

// 3. 網頁控制台 (API 與介紹網站風格同步)
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="UTF-8"><title>Polaris Control</title><script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-[#0b0e14] text-white flex flex-col items-center py-24 px-6">
    <h1 class="text-4xl font-black text-blue-500 italic mb-10 tracking-tighter">ADMIN_TERMINAL</h1>
    <div class="bg-white/5 p-8 rounded-3xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 class="text-xl font-bold mb-6 text-center uppercase tracking-widest text-blue-400">匿名傳送系統</h2>
        <select id="ch" class="w-full p-4 bg-black/40 rounded-xl mb-4 text-sm border border-white/5 outline-none focus:border-blue-500 transition"></select>
        <textarea id="msg" class="w-full h-40 p-4 bg-black/40 rounded-xl mb-4 text-sm border border-white/5 outline-none resize-none focus:border-blue-500 transition" placeholder="輸入訊息..."></textarea>
        <button onclick="send()" id="btn" class="w-full py-4 bg-blue-600 rounded-xl font-black hover:bg-blue-500 transition active:scale-95">發送至 DISCORD</button>
    </div>
    <script>
        async function load(){
            const res = await fetch('/api/channels').then(r=>r.json());
            document.getElementById('ch').innerHTML = res.map(c=>\`<option value="\${c.id}"># \${c.name}</option>\`).join('');
        }
        window.onload = load;
        async function send(){
            const ch=document.getElementById('ch').value, msg=document.getElementById('msg').value;
            if(!msg) return alert('內容不能為空');
            const btn=document.getElementById('btn'); btn.disabled=true; btn.innerText='傳送中...';
            const res = await fetch(\`/api/post?ch=\${ch}&msg=\${encodeURIComponent(msg)}\`);
            if(res.ok) { alert('發送成功！'); document.getElementById('msg').value=''; }
            else { alert('連線失敗'); }
            btn.disabled=false; btn.innerText='發送至 DISCORD';
        }
    </script>
</body>
</html>
`;

// 4. API 伺服器
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  const mainGuild = client.guilds.cache.get(process.env.GUILD_ID);

  if (reqUrl.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'}); res.end(boardHTML);
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
