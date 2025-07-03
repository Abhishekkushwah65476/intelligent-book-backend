// controllers/orderController.js

const Razorpay = require('razorpay');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const whatsappService = require('./whatsappController');
require('dotenv').config();

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Generate Admin Message (You receive this)
 */
function generateAdminMessage(address, items, total, paymentMethod, paymentId) {
  return `
📦 New Order Received!

👤 Name: ${address.fullName}
📞 Phone: ${address.phone}

📍 Address:
${address.street}, ${address.city}, ${address.state} - ${address.zipCode}

📚 Items:
${items.map(item => `- ${item.name} x ${item.quantity}`).join('\n')}

💰 Total: ₹${total}
💳 Payment: ${paymentMethod === 'prepaid' ? 'Prepaid' : 'COD'}
🧾 Payment ID: ${paymentMethod === 'prepaid' ? paymentId : 'N/A'}
  `;
}

/**
 * Generate Customer Message (Customer receives this)
 */
function generateCustomerMessage(address, total, paymentMethod) {
  return `
🎉 Thank you for your order, ${address.fullName}!

📚 Total Amount: ₹${total}
💳 Payment Method: ${paymentMethod === 'prepaid' ? 'Prepaid' : 'Cash on Delivery'}

🚚 Your order will be shipped soon!

📦 If you have any questions, feel free to reply to this message.

Thank you for shopping with us!
  `;
}

/**
 * Save Order to Database
 */
async function saveOrderToDatabase(orderData) {
  const db = getDb();
  
  const orderToSave = {
    ...orderData,
    createdAt: new Date(),
  };

  const result = await db.collection("orders").insertOne(orderToSave);
  return result;
}

/**
 * Send WhatsApp and SMS notifications
 */
async function sendNotifications(address, items, total, paymentMethod, paymentId) {
  const adminMessage = generateAdminMessage(address, items, total, paymentMethod, paymentId);
  const customerMessage = generateCustomerMessage(address, total, paymentMethod);

  // Send WhatsApp messages
  const adminResult = await whatsappService.sendMessage('919301680755', adminMessage);
  const customerResult = await whatsappService.sendMessage(address.phone, customerMessage);
  const smsResult = await whatsappService.sendTextSMS(address.phone, customerMessage);

  return {
    admin: adminResult.success ? 'Sent' : 'Failed',
    customer: customerResult.success ? 'Sent' : 'Failed',
    sms: smsResult.success ? 'Sent' : 'Failed'
  };
}

/**
 * Create Razorpay Order or Process COD
 */
const createOrder = async (req, res) => {
  const { items, address, paymentMethod, total } = req.body;

  // Validate required fields
  if (!items || !address || !paymentMethod || !total) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Validate address fields
  const requiredAddressFields = ['fullName', 'street', 'city', 'state', 'zipCode', 'email', 'phone'];
  for (const field of requiredAddressFields) {
    if (!address[field] || typeof address[field] !== 'string') {
      return res.status(400).json({ error: `Address field "${field}" is required and must be a string` });
    }
  }

  // Validate item prices sum up to total
  const calculatedTotal = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  if (calculatedTotal !== total) {
    return res.status(400).json({ error: 'Total does not match the sum of item prices' });
  }

  try {
    if (paymentMethod === 'prepaid') {
      // Create Razorpay order but don't save to DB yet
      const options = {
        amount: total * 100, // Convert to paise
        currency: 'INR',
        receipt: `receipt_${Date.now()}`,
      };

      const order = await razorpay.orders.create(options);
      
      return res.status(200).json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
      });
    } else if (paymentMethod === 'cod') {
      // For COD, immediately save to database and send notifications
      const orderData = {
        items,
        address,
        paymentMethod,
        total,
        paymentId: null,
        status: 'confirmed' // COD orders are confirmed immediately
      };

      // Save order to database
      const result = await saveOrderToDatabase(orderData);

      // Send notifications
      const notifications = await sendNotifications(address, items, total, paymentMethod, null);

      return res.status(200).json({
        message: 'COD Order placed successfully',
        orderId: result.insertedId,
        whatsappNotifications: notifications
      });
    } else {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ error: 'Error creating order: ' + error.message });
  }
};

/**
 * Verify Razorpay Payment and Complete Order
 */
const verifyPayment = async (req, res) => {
  const { 
    razorpay_order_id, 
    razorpay_payment_id, 
    razorpay_signature,
    items,
    address,
    total
  } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required fields for verification' });
  }

  if (!items || !address || !total) {
    return res.status(400).json({ error: 'Missing order details for saving' });
  }

  try {
    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature === razorpay_signature) {
      // Payment verified successfully, now save order to database
      const orderData = {
        items,
        address,
        paymentMethod: 'prepaid',
        total,
        paymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        status: 'confirmed' // Payment verified, order confirmed
      };

      // Save order to database
      const result = await saveOrderToDatabase(orderData);

      // Send notifications
      const notifications = await sendNotifications(address, items, total, 'prepaid', razorpay_payment_id);

      return res.status(200).json({ 
        message: 'Payment verified and order saved successfully',
        orderId: result.insertedId,
        whatsappNotifications: notifications
      });
    } else {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Error verifying payment: ' + error.message });
  }
};

/**
 * Save Order to MongoDB (Legacy endpoint - kept for backward compatibility)
 */
const saveOrder = async (req, res) => {
  const { items, address, paymentMethod, total, paymentId, status } = req.body;

  if (!items || !address || !paymentMethod || !total || !status) {
    return res.status(400).json({ error: 'Missing required fields for saving order' });
  }

  if (!address.phone || typeof address.phone !== 'string') {
    return res.status(400).json({ error: 'Phone number is required and must be a string' });
  }

  try {
    const orderData = {
      items,
      address,
      paymentMethod,
      total,
      paymentId: paymentMethod === 'prepaid' ? paymentId : null,
      status,
    };

    const result = await saveOrderToDatabase(orderData);

    // Send notifications
    const notifications = await sendNotifications(address, items, total, paymentMethod, paymentId);

    res.status(200).json({
      message: 'Order saved successfully',
      orderId: result.insertedId,
      whatsappNotifications: notifications
    });

  } catch (error) {
    console.error('Error saving order to database:', error);
    return res.status(500).json({ error: 'Failed to save order to database' });
  }
};

module.exports = { createOrder, verifyPayment, saveOrder };