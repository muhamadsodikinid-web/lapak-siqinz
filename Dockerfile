# Pake versi Node 20 FULL (tanpa embel-embel slim) biar mesinnya kebal
FROM node:20

WORKDIR /app

# Copy package.json doang buat diinstall
COPY package.json ./

# Bersihkan cache lama biar gak ada sampah nyangkut, lalu install
RUN npm cache clean --force && npm install --no-audit --no-fund

# Copy sisa file bot lu (index.js, dll)
COPY . .

# Eksekusi port
EXPOSE 3000

# Nyalakan mesinnya
CMD ["node", "index.js"]
