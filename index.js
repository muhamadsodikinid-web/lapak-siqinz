require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');

process.on('uncaughtException', (err) => console.error('🚨 [ABAIKAN]:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 [ABAIKAN]:', err?.message));

const app = express();
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.status(200).send('Lapak Siqinz Session Key Active!'));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server HTTP standby di port ${PORT}`));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const Groq = require('groq-sdk');
const axios = require('axios');
const pino = require('pino');
const NodeCache = require('node-cache');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const VIP_API_ID = process.env.VIP_API_ID;
const VIP_API_KEY = process.env.VIP_API_KEY;

const NOMOR_BOT = '6283878322624';          
const NOMOR_ADMIN = '6283142628969';        
const BIAYA_ADMIN = 3000;                   

function getVipSign() {
    if (process.env.VIP_SIGN) return process.env.VIP_SIGN;
    return crypto.createHash('md5').update(VIP_API_ID + VIP_API_KEY).digest('hex');
}

const chatHistories = {};     
const msgRetryCounterCache = new NodeCache();

async function startBot() {
    const SESSION_DIR = './sesi_lapak';
    
    // 💡 FITUR BACA SESSION DARI ENVIRONMENT VARIABLE RAILWAY
    if (process.env.SESSION_ID) {
        try {
            if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
            const credsPath = path.join(SESSION_DIR, 'creds.json');
            // Decode string base64 kembali jadi file creds
            const decodedSession = Buffer.from(process.env.SESSION_ID, 'base64').toString('utf-8');
            fs.writeFileSync(credsPath, decodedSession);
            console.log('✅ Kunci Sesi (SESSION_ID) berhasil dimuat! Melewati proses pairing...');
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
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '120.0.0.0'], 
        msgRetryCounterCache,
        connectTimeoutMs: 60000,      
        keepAliveIntervalMs: 15000,   
        syncFullHistory: false
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(NOMOR_BOT);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log('\n==================================================');
                console.log(` 🔑 KODE PAIRING LU: ${code} `);
                console.log(' (Masukin kode ini ke WA lu sekarang)');
                console.log('==================================================\n');
            } catch (err) {
                console.log('❌ Gagal minta kode pairing:', err.message);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch (e) {} });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus. Status: ${statusCode}. Reconnecting...`);
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                try { if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
            }
            setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERHUBUNG!');
            
            // 💡 FITUR AUTO-GENERATE SESSION KEY DENGAN JEDA 3 DETIK (BIAR PASTI MUNCUL)
            setTimeout(async () => {
                try {
                    const credsPath = path.join(SESSION_DIR, 'creds.json');
                    if (fs.existsSync(credsPath)) {
                        const sessionBuffer = fs.readFileSync(credsPath);
                        const sessionKey = sessionBuffer.toString('base64');
                        
                        console.log('\n==================================================');
                        console.log('🔥 INI SESSION KEY LU (COPY & TARUH DI RAILWAY) 🔥');
                        console.log('==================================================');
                        console.log(sessionKey);
                        console.log('==================================================\n');

                        // Bot otomatis ngirim kunci sesi ke nomor owner (lu sendiri)
                        await sock.sendMessage(`${NOMOR_ADMIN}@s.whatsapp.net`, { 
                            text: `*🔑 SESSION KEY LAPAK SIQINZ*\n\nSimpan teks di bawah ini dan taruh di Environment Variables Railway dengan nama:\n\n*SESSION_ID*\n\nValue-nya:\n\n${sessionKey}` 
                        });
                    } else {
                        console.log('⚠️ Waduh, file sesi belum kebentuk juga bre!');
                    }
                } catch (err) {
                    console.log('❌ Gagal membuat Session Key:', err.message);
                }
            }, 3000);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg || !msg.message) return;

        const senderJid = msg.key.remoteJid;
        if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;

        const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace('@c.us', '');
        const isFromMe = msg.key.fromMe;
        const isSelfChat = senderNumber === NOMOR_BOT || senderJid.includes(NOMOR_BOT);

        if (isFromMe && !isSelfChat) return; 

        const isAdmin = senderNumber === NOMOR_ADMIN || senderNumber === NOMOR_BOT || isSelfChat;
        let messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';
        if (!messageContent.trim() && !msg.message.imageMessage) return;

        const isImage = msg.message.imageMessage ? true : false;
        const textLower = messageContent.toLowerCase();

        if (textLower === 'menu' || textLower === '!menu') {
            let menuText = `*🎮 SELAMAT DATANG DI LAPAK SIQINZ 🎮*\n_Pusat Top Up Game Termurah & Terpercaya_\n\n` +
                           `*📋 MENU PELANGGAN:*\n` +
                           `➤ *!price* (Cek Harga Resmi + Admin Rp 3.000)\n` +
                           `➤ *!format* (Cara Order)\n` +
                           `➤ *!admin* (Hubungi Owner)\n\n`;
            if (isAdmin) {
                menuText += `*👑 PANEL KHUSUS ADMIN:*\n➤ *!ceksaldo*\n➤ *!proses <kode_layanan> <id>*\n`;
            }
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        if (textLower === '!price' || textLower === '!list' || textLower === '!layanan') {
            await sock.sendMessage(senderJid, { text: '⏳ Mengambil daftar harga resmi...' }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign, type: 'services' });
                const res = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                
                if (res.data && res.data.result && res.data.data) {
                    let services = res.data.data.slice(0, 10);
                    let textList = `*🔥 DAFTAR HARGA LAPAK SIQINZ 🔥*\n_(Sudah termasuk admin Rp 3.000)_\n\n`;
                    services.forEach((s, index) => {
                        let hargaJual = parseInt(s.price) + BIAYA_ADMIN;
                        textList += `${index + 1}. *${s.name}*\n   Kode: \`${s.code}\`\n   Harga: *Rp ${hargaJual.toLocaleString('id-ID')}* | Status: ${s.status}\n\n`;
                    });
                    textList += `_Kirim bukti tf ke: 083142628969 (a.n Muhamad Sodikin)_`;
                    await sock.sendMessage(senderJid, { text: textList }, { quoted: msg });
                }
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal memuat API: ${e.message}` }, { quoted: msg });
            }
            return;
        }

        if (textLower === '!format') {
            await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nKode Layanan:\nID Player & Server:\n\n_Transfer sesuai harga + admin Rp 3.000_\n_Kirim bukti ke rek: 083142628969 (a.n Muhamad Sodikin)_` }, { quoted: msg }); return;
        }
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        if (textLower === '!ceksaldo') {
            if (!isAdmin) return;
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign });
                const res = await axios.post('https://vip-reseller.co.id/api/profile', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo VIP:*\n\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {}
            return;
        }
        
        if (textLower.startsWith('!proses')) {
            if (!isAdmin) return;
            const parts = messageContent.split(' ').filter(Boolean);
            if (parts.length < 3) return;
            await sock.sendMessage(senderJid, { text: `⏳ Memproses pesanan *${parts[1]}*...` }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign, type: 'order', service: parts[1], data_no: parts[2] });
                const res = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                await sock.sendMessage(senderJid, { text: `📋 *Respon VIP:*\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi: ${e.message}` });
            }
            return;
        }

        if (!messageContent.startsWith('!')) {
            try {
                if (!chatHistories[senderJid]) chatHistories[senderJid] = [];
                const systemPrompt = `Lu adalah Muhamad Sodikin, pemilik "Lapak Siqinz". 
1. JIKA ORANG NGOBROL: Balas santai, ramah, Sunda/Indo, super singkat 5-10 kata.
2. JIKA KIRIM BUKTI TF & FORMAT ORDER: Cek rekening tujuan HARUS KE 083142628969 a.n MUHAMAD SODIKIN (termasuk admin Rp 3.000).
3. KETIKA ORDER OTOMATIS: Berikan format [AUTO_ORDER:KODE_LAYANAN|ID_TUJUAN] di akhir pesan.
4. JANGAN CHAT KE GRUP.`;

                let groqMessages = [{ role: "system", content: systemPrompt }, ...chatHistories[senderJid]];

                if (isImage) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Cek bukti transfer saya bre." },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                        ]
                    });
                } else {
                    groqMessages.push({ role: "user", content: messageContent });
                }

                const chatCompletion = await groq.chat.completions.create({
                    messages: groqMessages, 
                    model: "qwen/qwen3.8-27b", 
                    temperature: 0.7,
                    max_tokens: 250 
                });
                
                let responseText = chatCompletion.choices[0]?.message?.content || '';
                if (responseText) {
                    const autoOrderMatch = responseText.match(/\[AUTO_ORDER:(.*?)\|(.*?)\]/);
                    if (autoOrderMatch) {
                        const serviceCode = autoOrderMatch[1].trim();
                        const targetDataNo = autoOrderMatch[2].trim();
                        let cleanResponse = responseText.replace(/\[AUTO_ORDER:.*?\]/g, '').trim();
                        cleanResponse += `\n\n✅ *Bukti TF Valid (Termasuk Admin Rp 3.000)! Sistem otomatis menembak pesanan ke VIP...*`;
                        await sock.sendMessage(senderJid, { text: cleanResponse }, { quoted: msg });

                        try {
                            const finalSign = getVipSign();
                            const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign, type: 'order', service: serviceCode, data_no: targetDataNo });
                            const vipRes = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                            await sock.sendMessage(senderJid, { text: `🚀 *Status VIP:*\n\n${JSON.stringify(vipRes.data, null, 2)}` });
                        } catch (vipErr) {}
                    } else {
                        await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                    }

                    chatHistories[senderJid].push({ role: "user", content: messageContent });
                    chatHistories[senderJid].push({ role: "assistant", content: responseText });
                    if (chatHistories[senderJid].length > 6) chatHistories[senderJid].splice(0, 2);
                }
            } catch (err) {}
        }
    });
}

startBot();
