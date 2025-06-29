// controllers/whatsappController.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios'); // Added missing axios import
const dotenv = require("dotenv")
dotenv.config()

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;


class WhatsAppService {
  constructor() { 
    this.client = null;
    this.isReady = false;
    this.initializationPromise = null;
    this.initialize();
  }

  initialize() {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = new Promise((resolve, reject) => {
      try {
        this.client = new Client({
          authStrategy: new LocalAuth({
            dataPath: './whatsapp-session'
          }),
          puppeteer: {
            headless: true,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-dev-shm-usage',
              '--disable-accelerated-2d-canvas',
              '--no-first-run',
              '--no-zygote',
              '--disable-gpu',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
              '--ignore-certificate-errors',
              '--ignore-ssl-errors',
              '--ignore-certificate-errors-spki-list',
              '--disable-extensions'
            ],
            timeout: 60000,
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
          },
          webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
          }
        });

        this.client.on('qr', (qr) => {
          console.log('\n📱 WhatsApp QR Code received!');
          console.log('👆 Scan this QR code with WhatsApp on your phone:');
          console.log('   1. Open WhatsApp on your phone');
          console.log('   2. Go to Settings > Linked Devices');
          console.log('   3. Tap "Link a Device"');
          console.log('   4. Scan the QR code below:\n');
          
          qrcode.generate(qr, { small: true });
          
          console.log('\n⏳ Waiting for QR code to be scanned...\n');
        });

        this.client.on('ready', () => {
          console.log('✅ WhatsApp Client is ready!');
          console.log('📞 Connected WhatsApp number:', this.client.info?.wid?.user || 'Unknown');
          this.isReady = true;
          resolve();
        });

        this.client.on('authenticated', () => {
          console.log('🔐 WhatsApp authenticated successfully');
        });

        this.client.on('auth_failure', (msg) => {
          console.error('❌ WhatsApp authentication failed:', msg);
          reject(new Error('WhatsApp authentication failed'));
        });

        this.client.on('disconnected', (reason) => {
          console.log('📵 WhatsApp Client disconnected:', reason);
          this.isReady = false;
        });

        this.client.on('message', async (message) => {
          // Log incoming messages for debugging
          console.log(`📨 Received message from ${message.from}: ${message.body}`);
          
          // You can add auto-reply logic here if needed
          // Example: if message contains certain keywords, send auto-reply
        });

        // Initialize the client with retry mechanism
        this.initializeWithRetry();

        // Set timeout for initialization
        setTimeout(() => {
          if (!this.isReady) {
            console.log('⚠️  WhatsApp initialization timeout. Please try restarting the server.');
          }
        }, 60000); // 60 seconds timeout

      } catch (error) {
        console.error('❌ Error initializing WhatsApp client:', error);
        reject(error);
      }
    });

    return this.initializationPromise;
  }

  async initializeWithRetry(maxRetries = 3, delay = 5000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`🔄 Attempting to initialize WhatsApp client (attempt ${i + 1}/${maxRetries})`);
        await this.client.initialize();
        break;
      } catch (error) {
        console.error(`❌ Initialization attempt ${i + 1} failed:`, error.message);
        
        if (i === maxRetries - 1) {
          console.error('🚨 All initialization attempts failed. Please check your internet connection and try again.');
          throw error;
        }
        
        console.log(`⏳ Waiting ${delay/1000} seconds before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Clear session data if it exists and retry failed
        if (i > 0) {
          console.log('🗑️ Clearing session data for fresh start...');
          try {
            const fs = require('fs');
            const path = require('path');
            const sessionPath = path.join(process.cwd(), 'whatsapp-session');
            if (fs.existsSync(sessionPath)) {
              fs.rmSync(sessionPath, { recursive: true, force: true });
            }
          } catch (cleanupError) {
            console.warn('⚠️ Could not clear session data:', cleanupError.message);
          }
        }
      }
    }
  }

  async waitForReady() {
    if (this.isReady) return true;
    
    await this.initializationPromise;
    
    // Additional wait with retry mechanism
    for (let i = 0; i < 30; i++) {
      if (this.isReady) return true;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('WhatsApp client not ready after waiting');
  }

  async sendTextSMS(phoneNumber, message) {
    console.log('🔵 Twilio SMS Function Called');
    console.log('📱 SMS Phone Number:', phoneNumber);
    console.log('💬 SMS Message:', message?.substring(0, 50) + '...');

    const client = require('twilio')(accountSid, authToken);
  
    try {
      // Clean phone number
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      let finalNumber = cleanNumber;
  
      if (!finalNumber.startsWith('91') && !finalNumber.startsWith('+')) {
        finalNumber = `91${finalNumber}`;
      }
  
      const recipientNumber = `+${finalNumber}`;
  
      console.log('📞 Sending SMS to:', recipientNumber);
      console.log('📨 From:', twilioPhoneNumber);
  
      const result = await client.messages.create({
        body: message,
        from: twilioPhoneNumber,
        to: recipientNumber
      });
  
      console.log('✅ SMS sent successfully via Twilio:', result.sid);
      return {
        success: true,
        messageId: result.sid,
        provider: 'Twilio'
      };
    } catch (error) {
      console.error('❌ Error sending SMS via Twilio:', error.message);
      return {
        success: false,
        error: error.message,
        provider: 'Twilio'
      };
      }
    }
  

  async sendMessage(phoneNumber, message) {
    try {
      await this.waitForReady();
  
      if (!this.client) {
        throw new Error('WhatsApp client not initialized');
      }
  
      // Format phone number (ensure it starts with country code)
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      let finalNumber;
      
      if (cleanNumber.startsWith('91')) {
        finalNumber = cleanNumber;
      } else if (cleanNumber.startsWith('0')) {
        // Remove leading 0 and add country code
        finalNumber = `91${cleanNumber.substring(1)}`;
      } else {
        finalNumber = `91${cleanNumber}`;
      }
      
      const chatId = `${finalNumber}@c.us`;
  
      console.log(`📤 Sending message to: ${finalNumber}`);
      console.log(`💬 Message: ${message.substring(0, 100)}...`);
  
      // Check if number exists on WhatsApp
      const numberExists = await this.client.isRegisteredUser(chatId);
      if (!numberExists) {
        console.warn(`⚠️  Phone number ${finalNumber} is not registered on WhatsApp`);
        return { 
          success: false, 
          error: 'Phone number not registered on WhatsApp',
          phoneNumber: finalNumber 
        };
      }
  
      // Get chat (optional, for debugging)
      try {
        const chat = await this.client.getChatById(chatId);
        if (!chat) {
          console.warn(`⚠️ No existing chat found with ${chatId}, but proceeding with message send`);
        }
      } catch (chatError) {
        console.warn(`⚠️ Could not get chat for ${chatId}, but proceeding with message send`);
      }

      // Send the message - Handle null result properly
      let result;
      try {
        result = await this.client.sendMessage(chatId, message);
        console.log('✅ Message sent successfully');
        
        // Even if result is null/undefined, the message was sent successfully
        // This is a known behavior of whatsapp-web.js
        return { 
          success: true, 
          messageId: result?.id?.id || result?.id || `msg_${Date.now()}`,
          phoneNumber: finalNumber,
          sent: true
        };
        
      } catch (sendError) {
        console.error('🚨 sendMessage error:', sendError);
        throw sendError;
      }
  
    } catch (error) {
      console.error('❌ Error in sendMessage:', error.message);
      return { 
        success: false, 
        error: error.message,
        phoneNumber: phoneNumber 
      };
    }
  }

  async sendMediaMessage(phoneNumber, mediaPath, caption = '') {
    try {
      await this.waitForReady();

      const { MessageMedia } = require('whatsapp-web.js');
      const media = MessageMedia.fromFilePath(mediaPath);
      
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      const finalNumber = cleanNumber.startsWith('91') ? cleanNumber : `91${cleanNumber}`;
      const chatId = `${finalNumber}@c.us`;

      const result = await this.client.sendMessage(chatId, media, { caption });
      
      console.log('✅ Media message sent successfully');
      return { success: true, messageId: result.id?.id || result.id };

    } catch (error) {
      console.error('❌ Error sending media message:', error);
      return { success: false, error: error.message };
    }
  }

  async getStatus() {
    return {
      isReady: this.isReady,
      clientInfo: this.isReady ? {
        number: this.client.info?.wid?.user || 'Unknown',
        name: this.client.info?.pushname || 'Unknown'
      } : null
    };
  }

  // UPDATED: Test SMS function with MSG91
  async testSMS(phoneNumber = '919301680755') {
    console.log('🧪 Testing MSG91 SMS functionality...');
    const testMessage = 'Test SMS from MSG91! Your SMS integration is working perfectly. 🎉';
    const result = await this.sendTextSMS(phoneNumber, testMessage);
    console.log('🧪 MSG91 SMS Test Result:', result);
    return result;
  }

  // NEW: Send order confirmation SMS
  async sendOrderConfirmationSMS(phoneNumber, orderData) {
    const message = `🎉 Order Confirmed! Hi ${orderData.name}, your order of ₹${orderData.amount} has been received. Payment: ${orderData.paymentMethod}. Thank you for shopping with us!`;
    return await this.sendTextSMS(phoneNumber, message);
  }

  // NEW: Send order shipped SMS
  async sendOrderShippedSMS(phoneNumber, orderData, trackingId) {
    const message = `📦 Order Shipped! Hi ${orderData.name}, your order has been shipped. Tracking ID: ${trackingId}. You'll receive it soon!`;
    return await this.sendTextSMS(phoneNumber, message);
  }

  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
      console.log('🔴 WhatsApp client destroyed');
    }
  }
}

// Create singleton instance
const whatsappService = new WhatsAppService();

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down WhatsApp service...');
  await whatsappService.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down WhatsApp service...');
  await whatsappService.destroy();
  process.exit(0);
});

module.exports = whatsappService;