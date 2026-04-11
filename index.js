const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
const url = require('url');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 1. 全指令定義 (管理功能全數回歸 Discord)
const commands = [
  new SlashCommandBuilder().setName('clear').setDescription('清理訊息').addIntegerOption(o => o.setName('amount').setDescription('數量').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('warn').setDescription('正式警告成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('ban').setDescription('封鎖成員').addUserOption(o => o.setName('target').setDescription('目標').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('原因')).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('停權(靜音)成員').addUserOption(o => o.setName('target').setDescription('對象').setRequired(true)).addIntegerOption(o => o.setName('minutes').setDescription('分鐘').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('channel_lock').setDescription('切換頻道鎖定狀態').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('slowmode').setDescription('設置慢速模式').addIntegerOption(o => o.setName('seconds').setDescription('秒數').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('check_invite').setDescription('查詢伺服器邀請碼').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('server_report').setDescription('生成伺服器報告'),
  new SlashCommandBuilder().setName('user_info').setDescription('獲取成員檔案').addUserOption(o => o.setName('target').setDescription('對象')),
  new SlashCommandBuilder().setName('get_avatar').setDescription('獲取頭像連結').addUserOption(o => o.setName('target').setDescription('對象')),
  new SlashCommandBuilder().setName('role_list').setDescription('身分組統計')
].map(c => c.toJSON());

client.on('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log(`>>> Polaris V10 啟動成功 | 管理權限已就緒`);
  } catch (err) { console.error(err); }
});

// 2. 指令邏輯處理
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, guild, channel } = interaction;

  try {
    // 停權功能 (Timeout)
    if (commandName === 'timeout') {
      const target = options.getMember('target');
      const minutes = options.getInteger('minutes');
      await target.timeout(minutes * 60 * 1000);
      await interaction.reply(`🔇 已將 **${target.user.tag}** 停權（禁言） ${minutes} 分鐘。`);
    }

    // 封鎖功能 (Ban)
    if (commandName === 'ban') {
      const target = options.getUser('target');
      const reason = options.getString('reason') || '未註明原因';
      await guild.members.ban(target, { reason });
      await interaction.reply(`🚫 已成功封鎖 **${target.tag}**。原因：${reason}`);
    }

    // 頻道鎖定
    if (commandName === 'channel_lock') {
      const everyone = guild.roles.everyone;
      const canSend = channel.permissionsFor(everyone).has(PermissionFlagsBits.SendMessages);
      await channel.permissionOverwrites.edit(everyone, { SendMessages: !canSend });
      const embed = new EmbedBuilder()
        .setTitle(canSend ? "🔒 頻道鎖定" : "🔓 頻道解鎖")
        .setDescription(canSend ? "**此頻道目前已進入管制狀態，禁止發言。**" : "頻道已恢復正常。")
        .setColor(canSend ? 0xFF0000 : 0x00FF41);
      await interaction.reply({ embeds: [embed] });
    }

    // 清理訊息
    if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await channel.bulkDelete(amount, true);
      await interaction.reply({ content: `✅ 已清理 ${amount} 則訊息。`, ephemeral: true });
    }

    // 其他指令 (警告、邀請查詢、報告等)
    if (commandName === 'warn') {
      const target = options.getUser('target');
      const reason = options.getString('reason') || '未註明';
      const embed = new EmbedBuilder().setTitle("⚠️ 管理警告").setDescription(`目標: ${target}\n理由: ${reason}`).setColor(0xFFAA00);
      await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'check_invite') {
      const invites = await guild.invites.fetch();
      const list = invites.map(i => `\`${i.code}\` | ${i.inviter.tag} | 使用: ${i.uses}`).join('\n') || '無邀請碼';
      await interaction.reply(`📩 **活動邀請碼：**\n${list}`);
    }
  } catch (e) {
    console.error(e);
    if (!interaction.replied) await interaction.reply({ content: '❌ 執行失敗，請檢查機器人權限。', ephemeral: true });
  }
});

// 3. 網頁端：匿名留言板樣式介面
const boardHTML = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>匿名留言板樣式公告系統</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { background-color: #f4f7f6; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .board-container { max-width: 600px; margin: 50px auto; }
        .card { background: white; border: 1px solid #e1e4e8; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
        .card-header { border-bottom: 1px solid #f0f0f0; padding: 15px 20px; font-weight: bold; color: #555; }
    </style>
</head>
<body class="p-4">
    <div class="board-container">
        <div class="text-center mb-8">
            <h1 class="text-2xl font-bold text-gray-700">伺服器留言板</h1>
            <p class="text-sm text-gray-400">在這裡發布的消息將會同步至 Discord 頻道</p>
        </div>

        <div class="card">
            <div class="card-header text-sm flex justify-between">
                <span>NEW POST</span>
                <span class="text-gray-300 font-normal">No. 001</span>
            </div>
            <div class="p-6">
                <textarea id="msg" class="w-full h-40 p-4 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-blue-400 transition-all resize-none text-gray-700" placeholder="說點什麼吧..."></textarea>
                <button onclick="post()" id="btn" class="w-full mt-4 bg-gray-800 hover:bg-black text-white py-3 rounded-lg font-bold transition-all active:scale-95">送出留言</button>
            </div>
        </div>
        
        <div id="status" class="mt-4 text-center text-sm font-bold text-green-500 hidden">留言已成功傳送！</div>
    </div>

    <script>
        async function post() {
            const content = document.getElementById('msg').value;
            if(!content) return alert('內容不可以是空的唷！');
            const btn = document.getElementById('btn');
            btn.disabled = true; btn.innerText = '傳送中...';

            try {
                const res = await fetch(\`/api/post?msg=\${encodeURIComponent(content)}\`);
                if(res.ok) {
                    document.getElementById('msg').value = '';
                    document.getElementById('status').classList.remove('hidden');
                    setTimeout(() => document.getElementById('status').classList.add('hidden'), 3000);
                }
            } catch(e) { alert('傳送失敗，請稍後再試。'); }
            btn.disabled = false; btn.innerText = '送出留言';
        }
    </script>
</body>
</html>
`;

// 4. 後端 API 邏輯
http.createServer(async (req, res) => {
  const reqUrl = url.parse(req.url, true);
  
  if (reqUrl.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(boardHTML);
  } else if (reqUrl.pathname === '/api/post') {
    const msgContent = reqUrl.query.msg;
    // 使用環境變數中的 ANNOUNCE_CHANNEL_ID
    const channel = await client.channels.fetch(process.env.ANNOUNCE_CHANNEL_ID);
    
    if (channel && msgContent) {
      const embed = new EmbedBuilder()
        .setAuthor({ name: '匿名留言板公告', iconURL: 'https://i.imgur.com/8N4X98z.png' })
        .setDescription(msgContent)
        .setColor(0x00FF41)
        .setTimestamp();
        
      await channel.send({ embeds: [embed] });
      res.end('ok');
    } else {
      res.statusCode = 500; res.end('error');
    }
  }
}).listen(process.env.PORT || 3000);

client.login(process.env.TOKEN);
