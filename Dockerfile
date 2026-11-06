# Pake Node.js versi 20 yang paling stabil dan anti-crash buat Baileys
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV="production"

# Install alat tempur wajib biar modul nggak gagal compile
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 git && \
    rm -rf /var/lib/apt/lists/*

COPY package.json ./

# Jalankan npm install dengan mode hemat memori dan lewati peringatan gak penting
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .

EXPOSE 3000

# Perintah eksekusi utama
CMD [ "node", "index.js" ]
