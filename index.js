require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal'); // Alat gambar QR di CMD

const messageHandler = require('./handler'); 

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 Error Ringan:', err?.message));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_BOT = '6283878322624'; // Ganti nomor bot lu (opsional kalau mau pakai pairing)
const SESSION_DIR = './sesi_lapak';

async function startBot() {
    // Kalau SESSION_ID ada di environment variables, load otomatis
    if (process.env.SESSION_ID) {
        try {
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            fs.writeFileSync(path.join(SESSION_DIR, 'creds.json'), process.env.SESSION_ID);
            console.log('✅ Sesi dimuat dari Environment Variables Railway.');
        } catch (e) {}
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    // 🔥 JIKA BELUM LOGIN, TAMPILKAN QR / PAIRING DI CMD SAAT DI-RUN
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n==================================================');
            console.log('📷 SCAN BARKODE INI LANGSUNG DARI CMD LU!');
            console.log('==================================================\n');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus (${statusCode}). Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e){}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL KONEK DAN AKTIF 24/7 DI RAILWAY!');
            
            // Otomatis cetak Session Key buat jaga-jaga
            setTimeout(async () => {
                try {
                    const credsPath = path.join(SESSION_DIR, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const sessionKey = fs.readFileSync(credsPath).toString('utf-8');
                        console.log('\n================ SESSION KEY ===============');
                        console.log(sessionKey);
                        console.log('===========================================\n');
                    }
                } catch (err) {}
            }, 3000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message) return;
        await messageHandler(sock, msg); 
    });
}

startBot();
