const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { connectDB } = require("./mongodb/mongodb");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());
require("./routes/socketHandler")(io);

const PORT = 3002;

// Initialize MongoDB connection and then start the server
const startServer = async () => {
  try {
    // Try to connect to MongoDB but don't stop server if it fails
    try {
      await connectDB();
      console.log("MongoDB connection initialized");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error.message);
      console.log(
        "Server will start without MongoDB connection. Some features may not work."
      );
    }

    // Start the server regardless of MongoDB connection status
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Add a route to check server status
app.get("/api/status", (req, res) => {
  res.json({ status: "Server is running" });
});
