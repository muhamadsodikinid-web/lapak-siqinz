const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

// 1. WEB SERVER UTAMA (Wajib pakai process.env.PORT buat Railway)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Server Lapak Siqinz Melek di Railway Bos!');
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

// Ganti dengan nomor WA pribadi lu (Format: 628xxxxxxxxxx@c.us)
const NOMOR_ADMIN = '6283878322624@c.us'; 
const NOMOR_BOT_PAIRING = '6283878322624'; // Nomor yang dipakai buat bot

// 3. SETUP WHATSAPP CLIENT (Path Chromium disesuaikan buat Linux server Railway)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: process.env.CHROME_PATH || '/nix/store/.../bin/chromium', // Otomatis dibaca Nixpacks
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless'] 
    }
});

// Generate Pairing Code (Bukan QR)
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
    console.log('Bot Lapak Siqinz, Gemini AI, & API VIP Reseller siap meluncur di Railway!');
});

// 4. LOGIKA UTAMA (HANDLER PESAN MASUK)
client.on('message', async msg => {
    if (msg.from === 'status@broadcast' || msg.from.includes('@g.us')) return;

    // A. FITUR CEK SALDO VIP RESELLER (Khusus Admin)
    if (msg.body === '!ceksaldo') {
        if (msg.from !== NOMOR_ADMIN) return;
        
        msg.reply('Bentar bre, lagi ngecek brankas pusat...');
        try {
            const payload = new URLSearchParams({
                key: process.env.VIP_API_KEY,
                sign: process.env.VIP_SIGN
            });
            const responAPI = await axios.post('https://vipreseller.co.id/api/profile', payload);
            msg.reply(`Hasil cek server:\n${JSON.stringify(responAPI.data, null, 2)}`);
        } catch (error) {
            msg.reply('Gagal connect ke VIP Reseller bre.');
            console.error(error);
        }
        return;
    }

    // B. FITUR EKSEKUSI TRANSAKSI OTOMATIS (Khusus Admin)
    // Format: !proses [kodeproduk] [idgame]
    if (msg.body.startsWith('!proses')) {
        if (msg.from !== NOMOR_ADMIN) {
            msg.reply('Perintah khusus admin bre!');
            return;
        }

        const pesan = msg.body.split(' ');
        if (pesan.length < 3) {
            msg.reply('Format salah Bos. Ketik: !proses [kodeproduk] [idgame]\nContoh: !proses FF140 12345678');
            return;
        }

        const kodeProduk = pesan[1];
        const idGame = pesan[2];

        msg.reply(`Oke Bos, pesanan ${kodeProduk} buat ID ${idGame} lagi diproses ke server pusat...`);

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
                msg.reply(`Top up sukses bre! ✅\nPesanan ${kodeProduk} masuk ke ID ${idGame}.\nKeterangan: ${responAPI.data.message || '-'}`);
            } else {
                msg.reply(`Top up gagal bre. ❌\nKeterangan pusat: ${responAPI.data.message || 'Cek ulang ID game'}`);
            }
        } catch (error) {
            console.error('Error API VIP:', error);
            msg.reply('Waduh, koneksi ke VIP Reseller gangguan atau saldo habis.');
        }
        return;
    }

    // C. FITUR AI BACA GAMBAR STRUK PEMBAYARAN
    if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        
        if (media && media.mimetype.includes('image')) {
            msg.reply('Bentar bre, AI Lapak Siqinz lagi ngecek struk lu...');

            try {
                const imageParts = [{
                    inlineData: {
                        data: media.data,
                        mimeType: media.mimetype
                    }
                }];

                const promptStruk = `
                Lu adalah sistem verifikasi pembayaran. Cek gambar struk ini.
                Apakah ini bukti transfer/pembayaran yang valid? 
                Jawab HANYA menggunakan format JSON valid seperti ini, tanpa teks pengantar lain:
                {
                  "status": "valid",
                  "nominal": 20000,
                  "tanggal": "12 November 2026",
                  "alasan": "jelaskan singkat"
                }
                (Jika buram/palsu/bukan struk, ubah status jadi "mencurigakan").
                `;

                const result = await aiModel.generateContent([promptStruk, ...imageParts]);
                const balasanAI = result.response.text();
                
                const cleanJSON = balasanAI.replace(/```json|```/g, '').trim();
                const dataStruk = JSON.parse(cleanJSON);

                if (dataStruk.status === 'valid') {
                    msg.reply(`Sip, sistem baca struk lu nominal Rp ${dataStruk.nominal} (${dataStruk.tanggal}). \n\nLagi diterusin ke Admin buat dicek mutasi aslinya ya bre!`);
                    
                    await client.sendMessage(NOMOR_ADMIN, `🚨 *ADA ORDERAN MASUK!*\nAI ngecek struk valid:\n- Nominal: Rp ${dataStruk.nominal}\n- Tanggal: ${dataStruk.tanggal}\n- Catatan AI: ${dataStruk.alasan}\n\nCek mutasi m-BCA/DANA lu. Kalau beneran masuk, balas pakai format:\n*!proses [kodeproduk] [idgame]*`);
                } else {
                    msg.reply(`Waduh, struk lu ditolak sistem bre. Alasan: ${dataStruk.alasan}`);
                }

            } catch (error) {
                console.error('Gagal baca gambar struk:', error);
                msg.reply('Mata AI lagi burem bre, format gambarnya kurang jelas. Coba kirim ulang.');
            }
            return;
        }
    }

    // D. CHAT BIASA (Dilayani Gemini AI)
    try {
        const result = await aiModel.generateContent(msg.body);
        const balasan = result.response.text();
        msg.reply(balasan);
    } catch (error) {
        console.error('Gemini error:', error);
        msg.reply('Sistem AI lagi pusing bre, bentar ya.');
    }
});

client.initialize();
