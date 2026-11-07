require('dotenv').config();
const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const messageHandler = require('./handler'); 

process.on('uncaughtException', (err) => console.error('🚨 Error Ringan:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 Error Ringan:', err?.message));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Mesin Lapak Siqinz Aktif!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Web Server standby di port ${PORT}`));

const NOMOR_BOT = '6283878322624'; // 🔥 NOMOR WA BOT LU (TANPA +)
const SESSION_DIR = './sesi_lapak';

async function startBot() {
    // 1. Cek apakah ada SESSION_ID tersimpan di Environment Variables Railway
    if (process.env.SESSION_ID) {
        try {
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            const credsPath = path.join(SESSION_DIR, 'creds.json');
            fs.writeFileSync(credsPath, process.env.SESSION_ID);
            console.log('✅ SESSION_ID dimuat dari Variables Railway. Melewati pairing...');
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

    // 2. Kalau belum terdaftar, otomatis minta Pairing Code dan cetak di Logs Railway
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let phoneNumber = NOMOR_BOT.replace(/[^0-9]/g, '');
                console.log(`⏳ Meminta Kode Pairing untuk nomor: ${phoneNumber}...`);
                let code = await sock.requestPairingCode(phoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n========================================');
                console.log(`🔑 KODE PAIRING RAILWAY LU: ${code}`);
                console.log('========================================\n');
            } catch (err) {
                console.log('❌ Gagal minta pairing code:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus (Status: ${statusCode}). Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch(e){}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERSAMBUNG FULL DI WA!');
            
            // 3. 🔥 PAS UDAH KONEK, OTOMATIS CETAK SESSION KEY DI LOGS BUAT DISIMPEN KE VARIABEL
            setTimeout(async () => {
                try {
                    const credsPath = path.join(SESSION_DIR, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const sessionKey = fs.readFileSync(credsPath).toString('utf-8');
                        console.log('\n==================================================');
                        console.log('🔥 SALIN TEKS DI BAWAH INI KE VARIABLE `SESSION_ID` RAILWAY 🔥');
                        console.log('==================================================\n');
                        console.log(sessionKey);
                        console.log('\n==================================================\n');
                    }
                } catch (err) {
                    console.log('Gagal cetak session key:', err.message);
                }
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
