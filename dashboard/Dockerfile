FROM node:22-bookworm-slim AS frontend

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_URL=http://localhost:5001
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

EXPOSE 5174

CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5174", "--strictPort"]
