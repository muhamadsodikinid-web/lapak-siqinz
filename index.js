require('dotenv').config();
const crypto = require('crypto');

process.on('uncaughtException', (err) => console.error('🚨 [ABAIKAN] Error ringan:', err?.message));
process.on('unhandledRejection', (err) => console.error('🚨 [ABAIKAN] Error ringan:', err?.message));

const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => res.status(200).send('Bot Lapak Siqinz Railway Active 24/7!'));
app.get('/health', (req, res) => res.status(200).json({ status: 'UP' }));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server HTTP Express standby di port ${PORT}`));

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const Groq = require('groq-sdk');
const axios = require('axios');
const pino = require('pino');
const fs = require('fs');
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
    const SESSION_DIR = 'sesi_pairing_teks';
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false, // Matikan QR total
        browser: ['Ubuntu', 'Chrome', '20.0.04'], 
        msgRetryCounterCache,
        connectTimeoutMs: 60000,      
        defaultQueryTimeoutMs: 60000, 
        keepAliveIntervalMs: 10000,   
        syncFullHistory: false,       
        generateHighQualityLinkPreview: false
    });

    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log('\n⏳ Sedang meminta Kode Pairing dari WhatsApp...');
                let code = await sock.requestPairingCode(NOMOR_BOT);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                
                // 💡 CETAK BERSIH SEBAGAI TEKS BIASA DI LOG
                console.log('\n==================================================');
                console.log(` KODE PAIRING LU: ${code} `);
                console.log(' (Salin kode di atas, buka WA -> Perangkat Tertaut -> Tautkan dengan nomor)');
                console.log('==================================================\n');
            } catch (err) {
                console.log('\n❌ GAGAL MINTA KODE PAIRING:', err.message);
            }
        }, 10000); // Jeda 10 detik biar koneksi stabil dulu
    }

    sock.ev.on('creds.update', async () => { try { await saveCreds(); } catch (e) {} });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error)?.output?.statusCode;
            console.log(`⚠️ Koneksi terputus. Kode status: ${statusCode}. Menyambungkan ulang...`);
            
            if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                console.log('🔄 Sesi ditolak WA! Membersihkan folder sesi...');
                try { if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch (e) {}
                setTimeout(startBot, 2000);
            } else {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('🎉 BOT BERHASIL TERTAUT DAN AMAN DI SERVER RAILWAY 24/7!');
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
                menuText += `*👑 PANEL KHUSUS ADMIN:*\n` +
                            `➤ *!ceksaldo*\n` +
                            `➤ *!proses <kode_layanan> <id>* (Tembak Manual)\n`;
            }
            await sock.sendMessage(senderJid, { text: menuText }, { quoted: msg });
            return;
        }

        if (textLower === '!price' || textLower === '!list' || textLower === '!layanan') {
            await sock.sendMessage(senderJid, { text: '⏳ Mengambil daftar harga resmi dari server VIP Reseller...' }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign, type: 'services' });
                const res = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                
                if (res.data && res.data.result && res.data.data) {
                    let services = res.data.data.slice(0, 10);
                    let textList = `*🔥 DAFTAR HARGA LAPAK SIQINZ 🔥*\n_(Sudah termasuk biaya admin Rp 3.000)_\n\n`;
                    
                    services.forEach((s, index) => {
                        let hargaJual = parseInt(s.price) + BIAYA_ADMIN;
                        textList += `${index + 1}. *${s.name}*\n   Kode: \`${s.code}\`\n   Harga: *Rp ${hargaJual.toLocaleString('id-ID')}* | Status: ${s.status}\n\n`;
                    });
                    textList += `_Kirim bukti transfer ke rekening: 083142628969 (a.n Muhamad Sodikin)_`;
                    await sock.sendMessage(senderJid, { text: textList }, { quoted: msg });
                } else {
                    await sock.sendMessage(senderJid, { text: '❌ Gagal memuat daftar harga dari server.' }, { quoted: msg });
                }
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Terjadi kesalahan koneksi API: ${e.message}` }, { quoted: msg });
            }
            return;
        }

        if (textLower === '!format') {
            await sock.sendMessage(senderJid, { text: `*🛒 FORMAT ORDER*\nKode Layanan:\nID Player & Server:\n\n_Pastikan transfer sesuai harga + admin Rp 3.000_\n_Kirim bukti ke rek: 083142628969 (a.n Muhamad Sodikin)_` }, { quoted: msg }); return;
        }
        if (textLower === '!admin') {
            await sock.sendMessage(senderJid, { text: `📞 *Kontak Owner:* Muhamad Sodikin` }, { quoted: msg }); return;
        }

        if (textLower === '!ceksaldo') {
            if (!isAdmin) return;
            await sock.sendMessage(senderJid, { text: '⏳ Mengecek saldo ke VIP Reseller...' }, { quoted: msg });
            try {
                const finalSign = getVipSign();
                const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign });
                const res = await axios.post('https://vip-reseller.co.id/api/profile', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                await sock.sendMessage(senderJid, { text: `📊 *Hasil Cek Saldo VIP:*\n\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal konek VIP: ${e.message}` });
            }
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
                await sock.sendMessage(senderJid, { text: `📋 *Respon API VIP:*\n${JSON.stringify(res.data, null, 2)}` });
            } catch (e) {
                await sock.sendMessage(senderJid, { text: `❌ Gagal eksekusi: ${e.message}` });
            }
            return;
        }

        if (!messageContent.startsWith('!')) {
            try {
                if (!chatHistories[senderJid]) chatHistories[senderJid] = [];

                const systemPrompt = `Lu adalah Muhamad Sodikin, pemilik "Lapak Siqinz". 
ATURAN UTAMA:
1. JIKA ORANG NGOBROL BIASA: Balas santai, ramah, adaptif bahasa (Sunda/Indo), super singkat 5-10 kata.
2. JIKA ORANG KIRIM BUKTI TF & FORMAT ORDER: Cek teliti struknya, pastikan rekening tujuan HARUS KE 083142628969 a.n MUHAMAD SODIKIN. Perhatikan nominal mencakup harga dasar layanan + biaya admin Rp 3.000.
3. KETIKA ORDER OTOMATIS: Berikan format [AUTO_ORDER:KODE_LAYANAN|ID_TUJUAN] di akhir pesan.
4. JANGAN CHAT KE GRUP.`;

                let groqMessages = [{ role: "system", content: systemPrompt }, ...chatHistories[senderJid]];

                if (isImage) {
                    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                    const base64Image = buffer.toString('base64');
                    groqMessages.push({
                        role: "user",
                        content: [
                            { type: "text", text: messageContent || "Cek bukti transfer dan orderan saya bre." },
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
                        cleanResponse += `\n\n✅ *Bukti TF Valid (Termasuk Admin Rp 3.000)! Sistem otomatis menembak pesanan ke VIP Reseller...*`;
                        await sock.sendMessage(senderJid, { text: cleanResponse }, { quoted: msg });

                        try {
                            const finalSign = getVipSign();
                            const payload = new URLSearchParams({ key: VIP_API_KEY, sign: finalSign, type: 'order', service: serviceCode, data_no: targetDataNo });
                            const vipRes = await axios.post('https://vip-reseller.co.id/api/game-feature', payload, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                            await sock.sendMessage(senderJid, { text: `🚀 *Status Transaksi VIP Reseller:*\n\n${JSON.stringify(vipRes.data, null, 2)}` });
                        } catch (vipErr) {
                            await sock.sendMessage(senderJid, { text: `❌ Gagal otomatis nembak ke VIP Reseller: ${vipErr.message}` });
                        }
                    } else {
                        await sock.sendMessage(senderJid, { text: responseText }, { quoted: msg });
                    }

                    chatHistories[senderJid].push({ role: "user", content: messageContent });
                    chatHistories[senderJid].push({ role: "assistant", content: responseText });
                    if (chatHistories[senderJid].length > 6) chatHistories[senderJid].splice(0, 2);
                }
            } catch (err) {
                console.error('❌ Groq Error:', err?.message || err);
                await sock.sendMessage(senderJid, { text: 'Waduh puyeng, kirim ulang bre!' }, { quoted: msg });
            }
        }
    });
}

startBot();
