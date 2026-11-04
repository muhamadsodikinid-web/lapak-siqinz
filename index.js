const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const NodeCache = require('node-cache');

// 1. WEB SERVER EXPRESS (Biar Railway/UptimeRobot senang)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Baileys Lapak Siqinz Melek Bos!'));
app.listen(PORT, () => console.log(`Server express jalan di port ${PORT}`));

// 2. SETUP GEMINI AI & ADMIN
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game."
});

// Ganti nomor admin (Format: 628xxxxxxxxxx tanpa @c.us)
const NOMOR_ADMIN = '6283878322624'; 
const NOMOR_BOT_PAIRING = '6283878322624'; // Nomor yang mau dijadiin bot

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false // Kita pakai sistem Pairing Code
    });

    // Request Pairing Code otomatis kalau belum terkoneksi
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(NOMOR_BOT_PAIRING);
                console.log('=============================================');
                console.log('KODE PAIRING LU BRE (BAILEYS): ', code);
                console.log('Cek tab Logs Railway, lalu tautkan di WA!');
                console.log('=============================================');
            } catch (err) {
                console.error('Gagal minta kode pairing:', err);
            }
        }, 3000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menyambungkan ulang...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot Lapak Siqinz Berhasil Terhubung via Baileys!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // 3. HANDLER PESAN MASUK
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        // Ambil teks pesan (bisa dari text biasa atau extended)
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        // Abaikan kalau dari grup
        if (senderJid.endsWith('@g.us')) return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '');

        // A. CEK SALDO VIP RESELLER (Khusus Admin)
        if (messageContent === '!ceksaldo') {
            if (senderNumber !== NOMOR_ADMIN) return;
            await sock.sendMessage(senderJid, { text: 'Bentar bre, lagi ngecek brankas pusat...' });
            try {
                const payload = new URLSearchParams({ key: process.env.VIP_API_KEY, sign: process.env.VIP_SIGN });
                const responAPI = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `Hasil cek server:\n${JSON.stringify(responAPI.data, null, 2)}` });
            } catch (error) {
                await sock.sendMessage(senderJid, { text: 'Gagal connect ke VIP Reseller bre.' });
            }
            return;
        }

        // B. EKSEKUSI TRANSAKSI OTOMATIS (Khusus Admin)
        // Format: !proses [kodeproduk] [idgame]
        if (messageContent.startsWith('!proses')) {
            if (senderNumber !== NOMOR_ADMIN) {
                await sock.sendMessage(senderJid, { text: 'Perintah khusus admin bre!' });
                return;
            }

            const pesan = messageContent.split(' ');
            if (pesan.length < 3) {
                await sock.sendMessage(senderJid, { text: 'Format salah Bos. Ketik: !proses [kodeproduk] [idgame]' });
                return;
            }

            const kodeProduk = pesan[1];
            const idGame = pesan[2];

            await sock.sendMessage(senderJid, { text: `Oke Bos, pesanan ${kodeProduk} buat ID ${idGame} lagi diproses...` });

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
                    await sock.sendMessage(senderJid, { text: `Top up sukses bre! ✅\nPesanan ${kodeProduk} masuk ke ID ${idGame}.` });
                } else {
                    await sock.sendMessage(senderJid, { text: `Top up gagal bre. ❌ Keterangan: ${responAPI.data.message || 'Cek ulang ID'}` });
                }
            } catch (error) {
                await sock.sendMessage(senderJid, { text: 'Waduh, koneksi ke VIP Reseller gangguan.' });
            }
            return;
        }

        // C. CHAT BIASA (Dilayani Gemini AI)
        if (messageContent) {
            try {
                const result = await aiModel.generateContent(messageContent);
                await sock.sendMessage(senderJid, { text: result.response.text() });
            } catch (error) {
                console.error('Gemini error:', error);
                await sock.sendMessage(senderJid, { text: 'Sistem AI lagi pusing bre, bentar ya.' });
            }
        }
    });
}

startBot();
