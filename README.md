# NexaPay RFID Mobile Wallet System

A complete RFID-based digital wallet system with React Native mobile application, atomic database transactions, and IoT device integration via MQTT.

## 🎯 System Overview

NexaPay enables contactless payments and top-ups using RFID cards with a modern mobile application supporting both Agent (top-up) and Salesperson (payment) interfaces.

## 📋 Features Implemented

### 1. RFID Wallet System
- **Unique Card UIDs**: Each RFID card has a unique identifier
- **Balance Tracking**: Real-time wallet balance per card
- **Atomic Transactions**: Top-up and payment operations are atomic
- **Transaction Ledger**: Complete audit trail

### 2. Backend API (Express.js + MongoDB)
- **POST /topup**: Add balance to a card
- **POST /pay**: Deduct balance for payment
- **GET /balance/:uid**: Check current balance
- **GET /products**: Retrieve available products
- **GET /transactions/:uid**: View transaction history

### 3. Mobile Application Features (React Native + Expo)
- **Dual Interface**: Agent (top-up) & Salesperson (payment)
- **Real-time Updates**: Instant balance and transaction updates
- **Auto-Detection**: RFID cards detected automatically via backend
- **Cross-Platform**: iOS and Android support
- **Modern UI**: Native mobile experience with Tailwind CSS

### 4. MongoDB Atlas Integration
- **Atomic Operations**: Wallet update + transaction saved together
- **4 Collections**: cards, wallets, products, transactions
- **Immutable Ledger**: Prevents fraud and data corruption

### 5. MQTT Communication
- **Isolated Topics**: `rfid/team_07/card/*`
- **Device Commands**: Top-up and payment confirmations
- **Health Monitoring**: Device status tracking

## 🚀 Quick Setup

### Backend
```bash
cd backend
npm install
# NODE CONFIGURATION:
# - Update MONGODB_URI in database.js
# - Update MQTT_BROKER in server.js
npm run dev
# Runs on http://localhost:9243
```

### Mobile App (React Native + Expo)
```bash
cd frontend
npm install
# Start the development server
npx expo start
# Scan QR code with Expo Go app or run on simulator
```

### ESP8266 Firmware (Arduino IDE)
1. **Open Arduino IDE** and install required libraries:
   - MFRC522 (by GithubCommunity)
   - PubSubClient (by Nick O'Leary)
   - ArduinoJson (by Benoit Blanchon)
2. **Open** `firmware/iot_rfid_project/iot_rfid_project_v2/iot_rfid_project_v2.ino`
3. **Configure** WiFi credentials and MQTT broker settings in the code
4. **Select** ESP8266 board (NodeMCU 1.0 or similar)
5. **Upload** to ESP8266 via USB cable

**Note**: This project uses Arduino IDE, not MicroPython. Ignore any Python-related setup files.

### Hardware Wiring (ESP8266 + RC522)
| RC522 | ESP8266 |
|-------|---------|
| 3.3V  | 3V3     |
| GND   | GND     |
| RST   | D3      |
| SDA   | D4      |
| MOSI  | D7      |
| MISO  | D6      |
| SCK   | D5      |

## 💾 Database Schema

**cards**: `{uid, owner, createdAt}`  
**wallets**: `{cardUid, balance, updatedAt}`  
**products**: `{name, price, active}`  
**transactions**: `{cardUid, type, amount, previousBalance, newBalance, status, reason, createdAt}`

## 🔌 MQTT Topics

| Topic | Direction | Purpose |
|-------|-----------|---------|
| `card/status` | ESP→Backend | Card scan detection |
| `card/topup` | Backend→ESP | Top-up commands |
| `card/pay` | Backend→ESP | Payment confirmation |
| `device/health` | ESP→Backend | Health metrics |
| `device/status` | LWT | Online/offline |

## ✨ Key Features

✅ Atomic transactions (MongoDB sessions)  
✅ Double-spend prevention  
✅ Real-time mobile updates  
✅ Cross-platform mobile app (iOS/Android)  
✅ Clean architecture separation  
✅ Team isolation (MQTT namespacing)  
✅ Immutable audit trail  
✅ Dual mobile interfaces (Agent/Salesperson)  
✅ Modern React Native UI  

## 🛠 Project Structure

```
NexaPay/
├── backend/
│   ├── database.js
│   ├── server.js
│   └── package.json
├── firmware/
│   └── iot_rfid_project/
│       └── iot_rfid_project_v2/
│           └── iot_rfid_project_v2.ino
├── frontend/
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── agent/
│   │   │   └── salesperson/
│   │   ├── login.tsx
│   │   └── signup.tsx
│   ├── components/
│   ├── services/
│   ├── contexts/
│   └── package.json
└── README.md
```

## 📱 Mobile App Features

### Agent Interface
- **Profile Management**: Edit profile and settings
- **Top-up Operations**: Add balance to RFID cards
- **Transaction History**: View all top-up transactions
- **Notifications**: Real-time alerts and updates
- **Help Center**: Support and documentation

### Salesperson Interface
- **Product Catalog**: Browse available products
- **Payment Processing**: Process RFID card payments
- **Sales History**: Track payment transactions
- **Dashboard**: Sales analytics and overview
- **Profile Settings**: Manage account information

## 🔧 Technology Stack

- **Mobile**: React Native + Expo
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Navigation**: Expo Router
- **Backend**: Node.js + Express
- **Database**: MongoDB Atlas
- **IoT**: ESP8266 + RC522 RFID (Arduino IDE)
- **Communication**: MQTT Protocol

## ⚠️ Important Notes

- **Firmware**: This project uses **Arduino IDE** with C++ code (.ino files)
- **Setup**: Use Arduino IDE, not MicroPython or Python tools
- **Libraries**: Install Arduino libraries via Library Manager
- **Upload**: Direct upload from Arduino IDE to ESP8266

## 📝 Team ID: team_I

**Status**: Production Ready | **Updated**: March 2026

### Backend API
**http://157.173.101.159:9243/**
