# 1.
FROM node:20-slim

# 2. 
RUN apt-get update -y && apt-get install -y openssl

# 3.
WORKDIR /app

# 4. 
COPY package*.json ./
RUN npm install

# 5. 
COPY . .

# 6. 
RUN npx prisma generate

# 7.
EXPOSE 3000

# 8.
CMD ["npm", "run", "dev"]