const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// 1. WEB SERVER UTAMA (Render wajib pakai process.env.PORT)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Server Lapak Siqinz Melek di Render Bos!');
});

app.listen(PORT, () => {
    console.log(`Server express jalan di port ${PORT}`);
});

// 2. SETUP GEMINI AI & ADMIN
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game."
});

const NOMOR_ADMIN = '6283878322624@c.us'; 
const NOMOR_BOT_PAIRING = '6283878322624';

// 3. SETUP WHATSAPP CLIENT
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    }
});

client.on('qr', async () => {
    console.log('Lagi request Kode Pairing ke server WA...');
    try {
        const pairingCode = await client.requestPairingCode(NOMOR_BOT_PAIRING);
        console.log('=============================================');
        console.log('KODE PAIRING LU BRE: ', pairingCode);
        console.log('Cek logs di Render buat salin kodenya!');
        console.log('=============================================');
    } catch (error) {
        console.error('Gagal generate kode pairing:', error);
    }
});

client.on('ready', () => {
    console.log('Bot Lapak Siqinz siap tempur di Render!');
});

// 4. HANDLER CHAT (Sama seperti sebelumnya)
client.on('message', async msg => {
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;

    if (msg.body === '!ceksaldo') {
        if (msg.from !== NOMOR_ADMIN) return;
        msg.reply('Bentar bre, ngecek saldo...');
        try {
            const payload = new URLSearchParams({ key: process.env.VIP_API_KEY, sign: process.env.VIP_SIGN });
            const responAPI = await axios.post('https://vipreseller.co.id/api/profile', payload);
            msg.reply(JSON.stringify(responAPI.data));
        } catch (e) {
            msg.reply('Gagal connect VIP Reseller.');
        }
        return;
    }

    if (msg.body.startsWith('!proses')) {
        if (msg.from !== NOMOR_ADMIN) return;
        const pesan = msg.body.split(' ');
        if (pesan.length < 3) return msg.reply('Format: !proses [produk] [id]');
        
        try {
            const payload = new URLSearchParams({
                key: process.env.VIP_API_KEY,
                sign: process.env.VIP_SIGN,
                type: 'order',
                service: pesan[1],
                data_no: pesan[2]
            });
            const responAPI = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
            msg.reply(`Hasil: ${JSON.stringify(responAPI.data)}`);
        } catch (e) {
            msg.reply('Error transaksi.');
        }
        return;
    }

    // Chat AI biasa
    try {
        const result = await aiModel.generateContent(msg.body);
        msg.reply(result.response.text());
    } catch (e) {
        msg.reply('AI lagi pusing bre.');
    }
});

client.initialize();
