# pixpay-service

Standalone backend service for PixPay persistent automation.

## Purpose
This is a decoupled standalone microservice that acts as an independent daemon to manage and automate PixPay operations. It does not import React, Next.js, or any other client-specific modules.

## Folder Structure
```
pixpay-service/
├── src/
│   ├── server/           # Server bootstrap and app initialization
│   ├── routes/           # Express API endpoints
│   ├── controllers/      # Route controllers (health checks, etc.)
│   ├── services/         # Decoupled business logic services
│   ├── browser/          # Browser lifecycle managers
│   ├── middleware/       # Express middlewares (error handlers)
│   ├── config/           # Application configuration loaders
│   └── utils/            # Shared helper functions and logs
├── logs/                 # Service logging folder
├── browser-profile/      # Browser cookies and persistence context
├── package.json          # Node.js manifest
├── tsconfig.json         # TypeScript configuration
├── ecosystem.config.js   # PM2 configuration
├── .env.example          # Environment variables example
└── README.md             # This document
```

## How to Install
Install standard dependencies:
```bash
npm install
```

## How to Build
Compile the TypeScript code:
```bash
npm run build
```
This output is compiled directly into the `./dist` directory.

## How to Run
### Development
To run using `ts-node` for live development reload:
```bash
npm run dev
```

### Production
To build and run in production:
```bash
npm run build
npm start
```

### PM2 Process Manager
To start the daemon in the background using PM2:
```bash
pm2 start ecosystem.config.js --env production
```
