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
 * Create Razorpay Order or COD confirmation
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

  // Optional: Validate item prices sum up to total
  const calculatedTotal = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
  if (calculatedTotal !== total) {
    return res.status(400).json({ error: 'Total does not match the sum of item prices' });
  }

  try {
    if (paymentMethod === 'prepaid') {
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
      return res.status(200).json({
        message: 'Order placed successfully with Cash on Delivery',
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
 * Create WhatsApp Link from phone number and message
 */
function createWhatsAppLink(phoneNumber, message) {
  // Remove all non-digit characters
  const cleanNumber = phoneNumber.replace(/\D/g, '');

  // Ensure Indian numbers start with 91
  const finalNumber = cleanNumber.startsWith('91') ? cleanNumber : `91${cleanNumber}`;

  const encodedMessage = encodeURIComponent(message.trim());
  return `https://wa.me/${finalNumber}?text=${encodedMessage}`;
}

/**
 * Verify Razorpay Payment Signature
 */
const verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing required fields for verification' });
  }

  try {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generatedSignature === razorpay_signature) {
      return res.status(200).json({ message: 'Payment verified successfully' });
    } else {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    return res.status(500).json({ error: 'Error verifying payment: ' + error.message });
  }
};

/**
 * Save Order to MongoDB
 */


const saveOrder = async (req, res) => {
  const db = getDb();
  const { items, address, paymentMethod, total, paymentId, status } = req.body;

  if (!items || !address || !paymentMethod || !total || !status) {
    return res.status(400).json({ error: 'Missing required fields for saving order' });
  }

  if (!address.phone || typeof address.phone !== 'string') {
    return res.status(400).json({ error: 'Phone number is required and must be a string' });
  }

  try {
    const orderToSave = {
      items,
      address,
      paymentMethod,
      total,
      paymentId: paymentMethod === 'prepaid' ? paymentId : null,
      status,
      createdAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(orderToSave);

    // Generate WhatsApp messages
    const adminMessage = generateAdminMessage(address, items, total, paymentMethod, paymentId);
    const customerMessage = generateCustomerMessage(address, total, paymentMethod);

    // Send WhatsApp messages using whatsapp-web.js
    const adminResult = await whatsappService.sendMessage('919301680755', adminMessage);
    const customerResult = await whatsappService.sendMessage(address.phone, customerMessage);

    console.log('Admin notification:', adminResult);
    console.log('Customer notification:', customerResult);

    res.status(200).json({
      message: 'Order saved successfully',
      orderId: result.insertedId,
      whatsappNotifications: {
        admin: adminResult.success ? 'Sent' : 'Failed',
        customer: customerResult.success ? 'Sent' : 'Failed'
      }
    });

  } catch (error) {
    console.error('Error saving order to database:', error);
    return res.status(500).json({ error: 'Failed to save order to database' });
  }
};

module.exports = { createOrder, verifyPayment, saveOrder };