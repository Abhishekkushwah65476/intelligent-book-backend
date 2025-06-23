const express = require('express');
const router = express.Router();
const { createOrder, verifyPayment, saveOrder } = require('../controllers/orderController');

router.post('/create', createOrder);
router.post('/verify', verifyPayment);
router.post('/save', saveOrder);

module.exports = router;