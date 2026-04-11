const { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const http = require('http');
require('dotenv').config();

// --- 1. 防止 Render 休眠的 Web Server ---
http.createServer((req, res) => {
  res.write("Bot is alive!");
  res.end();
}).listen(process.env.PORT || 3000);

// --- 2. 機器人主程式 ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers]
});

const CONFIG = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  ANNOUNCE_CHANNEL_ID: process.env.ANNOUNCE_CHANNEL_ID // 公告頻道 ID
};

// 定義 /ban 指令
const commands = [
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('封鎖成員並發布公告')
    .addUserOption(option => option.setName('target').setDescription('要封鎖的成員').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('封鎖原因').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
].map(command => command.toJSON());

// 註冊指令
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CONFIG.CLIENT_ID, CONFIG.GUILD_ID), { body: commands });
    console.log(`${client.user.tag} 已上線，指令更新完成！`);
  } catch (error) {
    console.error(error);
  }
});

// 指令互動處理
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ban') {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    try {
      // 執行 Ban 動作
      await interaction.guild.members.ban(target, { reason: reason });

      // 建立公告 Embed
      const embed = new EmbedBuilder()
        .setTitle('🚫 成員封鎖公告')
        .setColor(0xff0000)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '使用者', value: `${target.tag} (${target.id})` },
          { name: '原因', value: reason },
          { name: '執行管理員', value: interaction.user.tag }
        )
        .setTimestamp();

      const channel = client.channels.cache.get(CONFIG.ANNOUNCE_CHANNEL_ID);
      if (channel) await channel.send({ embeds: [embed] });

      await interaction.reply({ content: `✅ 已成功封鎖 ${target.tag}`, ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: `❌ 失敗：請確認機器人權限。`, ephemeral: true });
    }
  }
});

client.login(CONFIG.TOKEN);
