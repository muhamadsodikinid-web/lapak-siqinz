require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

const messageHandler = require('./handler'); 

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 Error Ringan:', err?.message));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_ADMIN = '6283142628969';
const SESSION_DIR = './sesi_lapak';

async function startBot() {
    // 💡 FITUR BACA SESSION MENTAH DARI ENVIRONMENT VARIABLE RAILWAY
    if (process.env.SESSION_ID) {
        try {
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            const credsPath = path.join(SESSION_DIR, 'creds.json');
            
            // Langsung tulis isi SESSION_ID ke creds.json tanpa decode base64
            fs.writeFileSync(credsPath, process.env.SESSION_ID);
            console.log('✅ Kunci Sesi (SESSION_ID) berhasil dimuat dari Railway!');
        } catch (e) {
            console.log('❌ Gagal memuat SESSION_ID:', e.message);
        }
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

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n==================================================');
            console.log('📷 BARKODE MUNCUL! (Jika dijalankan di lokal)');
            qrcode.generate(qr, { small: true });
            console.log('==================================================\n');
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus (Status: ${statusCode}). Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e){}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERSAMBUNG DI RAILWAY!');
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
