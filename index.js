require('dotenv').config();

process.on('uncaughtException', (err) => console.error('🚨 UNCAUGHT EXCEPTION:', err?.message || err));
process.on('unhandledRejection', (err) => console.error('🚨 UNHANDLED REJECTION:', err?.message || err));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage } = require('@whiskeysockets/baileys');
const Groq = require('groq-sdk');
const express = require('express');
const axios = require('axios');
const pino = require('pino');
const fs = require('fs');
const NodeCache = require('node-cache');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Server Lapak Siqinz (String Session Final) Aktif!'));
app.listen(PORT, () => console.log(`🚀 Server jalan di port ${PORT}`));

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const VIP_API_KEY = process.env.VIP_API_KEY;
const VIP_SIGN = process.env.VIP_SIGN;
const NOMOR_BOT = '6283878322624'; 

let isAiActive = false;
const msgRetryCounterCache = new NodeCache();

// Pulihkan sesi dari Secrets Fly.io
function restoreSessionFromString() {
    if (!process.env.SESSION_STRING) return false;
    try {
        if (!fs.existsSync('auth_session')) fs.mkdirSync('auth_session', { recursive: true });
        const parsedFiles = JSON.parse(process.env.SESSION_STRING);
        for (const filename in parsedFiles) {
            fs.writeFileSync(`auth_session/${filename}`, JSON.stringify(parsedFiles[filename]));
        }
        console.log('✅ Berhasil memulihkan sesi dari Secrets Fly.io!');
        return true;
    } catch (e) {
        console.error('❌ Gagal memulihkan string session:', e);
        return false;
    }
}

async function startBot() {
    restoreSessionFromString();

    const { state, saveCreds } = await useMultiFileAuthState('auth_session');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'), 
        msgRetryCounterCache,
        connectTimeoutMs: 60000,      
        defaultQueryTimeoutMs: 60000, 
        keepAliveIntervalMs: 10000,   
        syncFullHistory: false        
    });

    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch (e) {} });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                try { if (fs.existsSync('auth_session')) fs.rmSync('auth_session', { recursive: true, force: true }); } catch (e) {}
                setTimeout(startBot, 2000);
            } else {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERTAUT OTOMATIS DARI SESSION STRING!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const isFromMe = msg.key.fromMe;
        if (isFromMe && (msg.key.id.startsWith('BAE5') || msg.key.id.length === 16 || msg.key.id.length === 32)) return;

        const senderJid = msg.key.remoteJid;
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isAdmin = isFromMe || senderNumber === NOMOR_BOT;

        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        const isImage = msg.message.imageMessage ? true : false;
        const textLower = messageContent.toLowerCase();

        if (textLower === 'menu' || textLower === '!menu') {
            let menuText = `*🎮 SELAMAT DATANG DI LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah & Terpercaya_\n\n` +
                           `*📋 MENU PELANGGAN:*\n➤ *!game* (Daftar Game)\n➤ *!format* (Cara Order)\n➤ *!admin* (Hubungi Owner)\n\n`;
            if (isAdmin) {
                menuText += `*👑 PANEL KHUSUS OWNER:*\nStatus AI: ${isAiActive ? '✅ NYALA' : '❌ MATI'}\n` +
                            `➤ *!on-ai* (Nyalakan AI)\n➤ *!off-ai* (Matikan AI)\n➤ *!ceksaldo* (Cek VIP)\n➤ *!proses <kode> <id>* (Tembak Order)\n`;
            }
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        if (textLower === '!game') {
            await sock.sendMessage(senderJid, { text: `*🎮 DAFTAR GAME*\n1. *Mobile Legends (ML)*\n2. *Free Fire (FF)*\nKetik *!format* untuk lanjut order.` }, { quoted: msg }); return;
        }
        if (textLower === '!format') {
            await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nGame:\nID Player:\nNominal Order:\n\n_Kirim bukti transfer ke sini._` }, { quoted: msg }); return;
        }
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        if (textLower === '!on-ai') {
            if (!isAdmin) return;
            isAiActive = true;
            await sock.sendMessage(senderJid, { text: '🤖 *Mode AI Aktif!* Bot Qinz siap membalas.' }, { quoted: msg }); return;
        }
        if (textLower === '!off-ai') {
            if (!isAdmin) return;
            isAiActive = false;
            await sock.sendMessage(senderJid, { text: '💤 *Mode AI Dimatikan!*' }, { quoted: msg }); return;
        }

        if (textLower === '!ceksaldo') {
            if (!isAdmin) return;
            try {
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: VIP_SIGN });
                const res = await axios.post('https://vipreseller.co.id/api/profile', payload);
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo:*\n\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) { await sock.sendMessage(senderJid, { text: `❌ Gagal konek ke API VIP Reseller.` }, { quoted: msg }); }
            return;
        }
        if (textLower.startsWith('!proses')) {
            if (!isAdmin) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            try {
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: VIP_SIGN, type: 'order', service: parts[1], data_no: parts[2] });
                const res = await axios.post('https://vipreseller.co.id/api/game-feature', payload);
                await sock.sendMessage(senderJid, { text: `📋 *Respon API:*\n${JSON.stringify(res.data, null, 2)}` }, { quoted: msg });
            } catch (e) { await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi transaksi.` }, { quoted: msg }); }
            return;
        }

        if (isAiActive && !messageContent.startsWith('!')) {
            try {
                let groqMessages = [{ role: "system", content: "Lu adalah asisten admin Lapak Siqinz bernama Bot Qinz. Jawab pake bahasa santai ala anak tongkrongan. Tugas lu melayani top up game dan ngecek screenshot transfer." }];

                if (isImage) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Tolong cek bukti screenshot ini bre." },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    });
                } else {
                    groqMessages.push({ role: "user", content: messageContent });
                }

                const chatCompletion = await groq.chat.completions.create({
                    messages: groqMessages, model: "llama-3.2-90b-vision-preview", temperature: 0.7,
                });
                const responseText = chatCompletion.choices[0]?.message?.content || '';
                if (responseText) await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
            } catch (err) {
                await sock.sendMessage(senderJid, { text: 'Waduh bre, AI-nya lagi loading berat. Coba ulang.' }, { quoted: msg });
            }
        }
    });
}

startBot();
