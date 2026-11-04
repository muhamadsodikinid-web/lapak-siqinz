const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// 1. WEB SERVER UTAMA (Wajib port dinamis Railway)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Server Lapak Siqinz Melek Anti-Crash!');
});

app.listen(PORT, () => {
    console.log(`Server express jalan di port ${PORT}`);
});

// 2. SETUP GEMINI AI & ADMIN
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game. Kalau ada yang mau beli, arahkan mereka buat kirim format order atau kirim bukti transfer struk pembayaran."
});

const NOMOR_ADMIN = '6283878322624@c.us'; 
const NOMOR_BOT_PAIRING = '6283878322624';

// 3. SETUP WHATSAPP CLIENT (Konfigurasi paling kebal buat server Linux/Railway)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Generate Pairing Code
client.on('qr', async () => {
    console.log('Lagi request Kode Pairing ke server WA...');
    try {
        const pairingCode = await client.requestPairingCode(NOMOR_BOT_PAIRING);
        console.log('=============================================');
        console.log('KODE PAIRING LU BRE: ', pairingCode);
        console.log('Cek tab "Logs" di Railway buat salin 8 digit kodenya!');
        console.log('=============================================');
    } catch (error) {
        console.error('Gagal generate kode pairing:', error);
    }
});

client.on('ready', () => {
    console.log('Bot Lapak Siqinz berhasil tembus dan siap meluncur di Railway!');
});

// 4. HANDLER PESAN MASUK
client.on('message', async msg => {
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;

    if (msg.body === '!ceksaldo') {
        if (msg.from !== NOMOR_ADMIN) return;
        msg.reply('Bentar bre, lagi ngecek brankas pusat...');
        try {
            const payload = new URLSearchParams({ key: process.env.VIP_API_KEY, sign: process.env.VIP_SIGN });
            const responAPI = await axios.post('https://vipreseller.co.id/api/profile', payload);
            msg.reply(`Hasil cek server:\n${JSON.stringify(responAPI.data, null, 2)}`);
        } catch (error) {
            msg.reply('Gagal connect ke VIP Reseller bre.');
        }
        return;
    }

    if (msg.body.startsWith('!proses')) {
        if (msg.from !== NOMOR_ADMIN) return;
        const pesan = msg.body.split(' ');
        if (pesan.length < 3) {
            msg.reply('Format salah Bos. Ketik: !proses [kodeproduk] [idgame]');
            return;
        }

        const kodeProduk = pesan[1];
        const idGame = pesan[2];

        msg.reply(`Oke Bos, pesanan ${kodeProduk} buat ID ${idGame} lagi diproses...`);

        try {
            const urlTransaksi = 'https://vipreseller.co.id/api/game-feature'; 
            const payload = new URLSearchParams({
                key: process.env.VIP_API_KEY,
                sign: process.env.VIP_SIGN,
                type: 'order',
                service: kodeProduk,
                data_no: idGame
            });

            const responAPI = await axios.post(urlTransaksi, payload);
            
            if (responAPI.data && responAPI.data.result === true) {
                msg.reply(`Top up sukses bre! ✅\nPesanan ${kodeProduk} masuk ke ID ${idGame}.`);
            } else {
                msg.reply(`Top up gagal bre. ❌ Keterangan: ${responAPI.data.message || 'Cek ulang ID'}`);
            }
        } catch (error) {
            msg.reply('Waduh, koneksi ke VIP Reseller gangguan.');
        }
        return;
    }

    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        if (media && media.mimetype.includes('image')) {
            msg.reply('Bentar bre, AI lagi ngecek struk lu...');
            try {
                const imageParts = [{ inlineData: { data: media.data, mimeType: media.mimetype } }];
                const promptStruk = `Cek gambar struk ini. Valid atau tidak? Jawab format JSON: {"status": "valid", "nominal": 20000, "tanggal": "12 Nov 2026", "alasan": "ok"}`;
                
                const result = await aiModel.generateContent([promptStruk, ...imageParts]);
                const dataStruk = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());

                if (dataStruk.status === 'valid') {
                    msg.reply(`Sip, struk terbaca nominal Rp ${dataStruk.nominal}. Diteruskan ke Admin.`);
                    await client.sendMessage(NOMOR_ADMIN, `🚨 *ORDERAN MASUK!*\nNominal: Rp ${dataStruk.nominal}\nBalas: *!proses [produk] [id]*`);
                } else {
                    msg.reply(`Struk ditolak: ${dataStruk.alasan}`);
                }
            } catch (error) {
                msg.reply('AI gagal baca gambar.');
            }
            return;
        }
    }

    try {
        const result = await aiModel.generateContent(msg.body);
        msg.reply(result.response.text());
    } catch (error) {
        msg.reply('AI lagi pusing bre.');
    }
});

client.initialize();
