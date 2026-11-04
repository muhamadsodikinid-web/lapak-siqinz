const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

// 1. WEB SERVER EXPRESS
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Lapak Siqinz Aktif!'));
app.listen(PORT, () => console.log(`Server express jalan di port ${PORT}`));

// 2. SETUP GEMINI AI & ADMIN
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const aiModel = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Lu adalah admin CS Lapak Siqinz. Jawab pake bahasa santai (bre, lu, gua). Tugas lu melayani pertanyaan seputar top up game."
});

const NOMOR_ADMIN = '6283878322624'; 

async function startBot() {
    // PENTING: Hapus isi folder auth_session jika sebelumnya error agar bersih total
    const { state, saveCreds } = await useMultiFileAuthState('auth_session');

    const sock = makeWASocket({
        logger: pino({ level: 'fatal' }),
        auth: state,
        printQRInTerminal: false
    });

    // CETAK QR CODE KE LOGS RAILWAY
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('==================================================');
            console.log('SCAN QR CODE DI BAWAH INI PAKAI WHATSAPP DI HP LU:');
            console.log('==================================================');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus, mencoba menyambungkan ulang...', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            } else {
                console.log('Koneksi terputus total. Sesi logout, hapus auth_session.');
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT LAPAK SIQINZ BERHASIL TERHUBUNG SEMPURNA!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // HANDLER PESAN MASUK
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const senderJid = msg.key.remoteJid;
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        
        if (senderJid.endsWith('@g.us')) return;
        const senderNumber = senderJid.replace('@s.whatsapp.net', '');

        // A. CEK SALDO ADMIN
        if (messageContent === '!ceksaldo') {
            if (senderNumber !== NOMOR_ADMIN) return;
            await sock.sendMessage(senderJid, { text: 'Bentar bre, ngecek brankas...' });
            try {
                const payload = new URLSearchParams({ key: process.env.VIP_API_KEY, sign: process.env.VIP_SIGN });
                const responAPI = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `Hasil:\n${JSON.stringify(responAPI.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: 'Gagal connect VIP Reseller.' });
            }
            return;
        }

        // B. PROSES TRANSAKSI ADMIN
        if (messageContent.startsWith('!proses')) {
            if (senderNumber !== NOMOR_ADMIN) {
                await sock.sendMessage(senderJid, { text: 'Khusus admin bre!' });
                return;
            }
            const pesan = messageContent.split(' ');
            if (pesan.length < 3) {
                await sock.sendMessage(senderJid, { text: 'Format: !proses [produk] [idgame]' });
                return;
            }
            try {
                const payload = new URLSearchParams({
                    key: process.env.VIP_API_KEY,
                    sign: process.env.VIP_SIGN,
                    type: 'order',
                    service: pesan[1],
                    data_no: pesan[2]
                });
                const responAPI = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
                await sock.sendMessage(senderJid, { text: `Respon:\n${JSON.stringify(responAPI.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: 'Gagal eksekusi transaksi.' });
            }
            return;
        }

        // C. CHAT AI GEMINI
        if (messageContent) {
            try {
                const result = await aiModel.generateContent(messageContent);
                await sock.sendMessage(senderJid, { text: result.response.text() });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: 'AI lagi pusing bre.' });
            }
        }
    });
}

startBot();
