require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

let db;
let client;

async function connectToDatabase() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGO_URI environment variable is not defined");
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    await client.connect();
    db = client.db(); // or client.db("bookstore")
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    process.exit(1);
  }
}

function getDb() {
  if (!db) {
    throw new Error("Database not connected");
  }
  return db;
}

function getClient() {
  if (!client) {
    throw new Error("MongoDB client not initialized");
  }
  return client;
}

module.exports = {
  connectToDatabase,
  getDb,
  getClient
};