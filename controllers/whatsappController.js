// controllers/whatsappController.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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
              '--disable-gpu'
            ]
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

        // Initialize the client
        this.client.initialize();

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

      const result = await this.client.sendMessage(chatId, message);
      
      console.log('✅ Message sent successfully');
      return { 
        success: true, 
        messageId: result.id?.id || result.id,
        phoneNumber: finalNumber 
      };

    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error.message);
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