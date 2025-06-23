// server.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { connectToDatabase } = require('./config/db');
const orderRoutes = require('./routes/orderRoutes');

// Load environment variables
dotenv.config();

const app = express(); 

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'], 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
})); 

app.use(express.json());

// Connect to MongoDB
connectToDatabase();

// Routes 
app.use('/api/orders', orderRoutes);

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});