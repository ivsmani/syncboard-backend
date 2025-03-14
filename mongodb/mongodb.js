const { MongoClient } = require("mongodb");

// MongoDB connection string
const uri =
  "mongodb+srv://sreelakshmi:uWH7dGJq099JxG6H@syncboard.kh6rw.mongodb.net";

// Create a new MongoClient with TLS options to fix SSL handshake issues
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

let db;
let isConnected = false;

const connectDB = async () => {
  // Only connect if not already connected
  if (isConnected && db) {
    return;
  }

  try {
    await client.connect();
    db = client.db("syncboard"); // Database name
    isConnected = true;
    console.log("MongoDB Connected...");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    isConnected = false;
    db = null;
    // Don't exit the process, just log the error
  }
};

// Add a function to close the connection when needed
const closeConnection = async () => {
  if (client) {
    await client.close();
    isConnected = false;
    db = null;
    console.log("MongoDB connection closed");
  }
};

// Handle process termination
process.on("SIGINT", async () => {
  await closeConnection();
  process.exit(0);
});

// Helper function to ensure DB is connected before operations
const ensureConnected = async () => {
  if (!isConnected || !db) {
    await connectDB();
  }

  // If still not connected, throw a more descriptive error
  if (!db) {
    throw new Error(
      "Unable to connect to MongoDB. Database operations cannot be performed."
    );
  }

  return db;
};

module.exports = {
  connectDB,
  read: async function (query, targetcollection, res) {
    try {
      const database = await ensureConnected();
      const result = await database
        .collection(targetcollection)
        .find()
        .toArray();
      return result;
    } catch (err) {
      console.log(err);
      if (res) res.status(500).json({ error: err.message });
      // Return empty array instead of throwing to prevent app crashes
      return [];
    }
  },
  write: async function (query, targetcollection, res) {
    try {
      const database = await ensureConnected();
      console.log("query", query);
      const result = await database
        .collection(targetcollection)
        .insertOne(query);
      return result;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
  update: async function (query, targetcollection, res) {
    try {
      const database = await ensureConnected();

      // Determine which fields to update based on the collection
      let updateFields = {};

      if (targetcollection === "stickyNotes") {
        // For sticky notes, update text and color
        updateFields = { text: query.text, color: query.color };
      } else if (targetcollection === "drawings") {
        // For drawings, update paths and any other relevant fields
        updateFields = {};

        // Copy all fields except id and _id
        Object.keys(query).forEach((key) => {
          if (key !== "id" && key !== "_id") {
            updateFields[key] = query[key];
          }
        });
      } else {
        // For other collections, use a generic approach
        updateFields = query;
      }

      const result = await database
        .collection(targetcollection)
        .updateOne({ id: query.id }, { $set: updateFields });
      return result;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
  delete: async function (query, targetcollection, res) {
    try {
      const database = await ensureConnected();
      const result = await database
        .collection(targetcollection)
        .deleteOne({ id: query });
      return result;
    } catch (err) {
      console.log(err);
      throw err;
    }
  },
  closeConnection,
};
