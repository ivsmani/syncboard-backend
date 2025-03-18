const {
  getStickyNotes,
  addStickyNote,
  deleteStickyNote,
  updateStickyNote,
} = require("../controller/stickyNoteController");
const {
  saveDrawings,
  getDrawings,
  deletedrawings,
} = require("../controller/drawingController");

// Store current drawings in memory for quick access
let currentDrawings = [];
let stickyNotesCache = [];
// Since we're only dealing with one drawing for now, we'll keep a reference to it
let mainDrawing = { id: "main-drawing", paths: [] };

// Track connected users
const connectedUsers = new Map();

// Track which user is currently drawing
let currentlyDrawingUser = null;

// Track the last activity time of the drawing user
let lastDrawingActivity = Date.now();

// Define a timeout for auto-clearing drawing state due to inactivity
const DRAWING_INACTIVITY_TIMEOUT = 20000; // 20 seconds

// Debounce timers for saving to MongoDB
const saveTimers = new Map();
const DEBOUNCE_DELAY = 2000; // 2 seconds debounce delay
const POSITION_UPDATE_THROTTLE = 50; // 50ms throttle for position updates

// Track the last update time for each sticky note to prevent excessive updates
const lastUpdateTimes = new Map();

/**
 * Debounce function for saving to MongoDB
 * @param {string} id - Unique identifier for the debounce timer
 * @param {Function} saveFunction - Function to call after debounce
 * @param {Object} data - Data to save
 */
const debounceSave = (id, saveFunction, data) => {
  // Clear any existing timer for this id
  if (saveTimers.has(id)) {
    clearTimeout(saveTimers.get(id));
  }

  // Set a new timer
  const timerId = setTimeout(async () => {
    try {
      await saveFunction(data);
      console.log(`Debounced save completed for ${id}`);
      saveTimers.delete(id);
    } catch (error) {
      console.error(`Error in debounced save for ${id}:`, error);
    }
  }, DEBOUNCE_DELAY);

  // Store the timer id
  saveTimers.set(id, timerId);
};

/**
 * Throttle function for position updates
 * @param {string} id - Unique identifier for the throttle
 * @param {Function} callback - Function to call
 * @returns {boolean} - Whether the function should proceed
 */
const throttleUpdate = (id) => {
  const now = Date.now();
  const lastUpdate = lastUpdateTimes.get(id) || 0;

  if (now - lastUpdate < POSITION_UPDATE_THROTTLE) {
    return false; // Too soon, don't update
  }

  lastUpdateTimes.set(id, now);
  return true; // Proceed with update
};

/**
 * Broadcast the current user presence to all connected clients
 * @param {Object} io - Socket.io instance
 */
const broadcastUserPresence = (io) => {
  const users = Array.from(connectedUsers.values()).map((user) => {
    return {
      ...user,
      isDrawing: user.id === currentlyDrawingUser,
      // Add a timestamp for when drawing status changed to help with animations
      lastStatusChange:
        user.id === currentlyDrawingUser && !user.isDrawing
          ? Date.now()
          : user.lastStatusChange,
    };
  });

  io.emit("user-presence-update", users);
  console.log(
    `Broadcasting user presence: ${
      users.length
    } users connected, currently drawing: ${currentlyDrawingUser || "none"}`
  );
};

// Initialize data from database
const initializeData = async () => {
  try {
    // Load existing drawings from database
    const drawings = await getDrawings();
    if (drawings && Array.isArray(drawings)) {
      currentDrawings = drawings;

      // Find the main drawing or create it if it doesn't exist
      const existingMainDrawing = drawings.find((d) => d.id === "main-drawing");
      if (existingMainDrawing) {
        // Ensure paths is always an array
        mainDrawing = {
          ...existingMainDrawing,
          paths: Array.isArray(existingMainDrawing.paths)
            ? existingMainDrawing.paths
            : [],
        };
        console.log("Loaded main drawing from database");
      } else {
        mainDrawing = { id: "main-drawing", paths: [] };
        console.log("No main drawing found, using empty drawing");
      }
    } else {
      // Default empty drawing if nothing found in database
      mainDrawing = { id: "main-drawing", paths: [] };
      console.log("No drawings found in database, using empty drawing");
    }

    // Load existing sticky notes from database
    const notes = await getStickyNotes();
    if (notes && Array.isArray(notes)) {
      stickyNotesCache = notes;
    }

    console.log(
      `Initialized with ${currentDrawings.length} drawings and ${stickyNotesCache.length} sticky notes`
    );
  } catch (err) {
    console.error("Error initializing data:", err);
    // Default to empty drawing on error
    mainDrawing = { id: "main-drawing", paths: [] };
  }
};

// Set up a periodic check for drawing inactivity
const setupDrawingInactivityCheck = (io) => {
  // Check every 10 seconds for inactive drawing sessions
  setInterval(() => {
    if (currentlyDrawingUser) {
      const inactivityTime = Date.now() - lastDrawingActivity;
      if (inactivityTime > DRAWING_INACTIVITY_TIMEOUT) {
        console.log(
          `Drawing inactive for ${inactivityTime}ms, auto-clearing drawing state`
        );
        currentlyDrawingUser = null;
        broadcastUserPresence(io);
      }
    }
  }, 10000); // Check every 10 seconds
};

/**
 * Force clear the drawing state for a specific user or all users
 * @param {Object} io - Socket.io instance
 * @param {string|null} userId - User ID to clear, or null to check all users
 */
const forceClearDrawingState = (io, userId = null) => {
  // If a specific user ID is provided, only clear if they are the drawing user
  if (userId && userId === currentlyDrawingUser) {
    console.log(`Force clearing drawing state for user ${userId}`);
    currentlyDrawingUser = null;
    broadcastUserPresence(io);
    return true;
  }
  // If no user ID is provided, clear the current drawing user regardless
  else if (!userId && currentlyDrawingUser) {
    console.log(`Force clearing drawing state for all users`);
    currentlyDrawingUser = null;
    broadcastUserPresence(io);
    return true;
  }
  return false;
};

module.exports = (io) => {
  // Initialize data when the server starts
  initializeData();

  // Set up the drawing inactivity check
  setupDrawingInactivityCheck(io);

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Add user to connected users with default info
    connectedUsers.set(socket.id, {
      id: socket.id,
      joinedAt: new Date(),
      color: getRandomColor(),
      initial: getRandomInitial(),
      lastStatusChange: Date.now(),
      isDrawing: false,
    });

    // Broadcast updated user presence to all clients
    broadcastUserPresence(io);

    // Immediately send existing drawings and sticky notes to the new client
    socket.emit("load-drawing", mainDrawing);
    socket.emit("load-sticky-notes", stickyNotesCache);

    // Handle user info update
    socket.on("update-user-info", (userInfo) => {
      if (connectedUsers.has(socket.id)) {
        // Update user info
        const currentInfo = connectedUsers.get(socket.id);
        connectedUsers.set(socket.id, {
          ...currentInfo,
          ...userInfo,
        });

        // Broadcast updated user presence
        broadcastUserPresence(io);
      }
    });

    // Handle client requesting to load sticky notes
    socket.on("load-sticky-notes", async () => {
      try {
        // Refresh from database to ensure latest data
        const notes = await getStickyNotes();
        stickyNotesCache = notes;

        // Send to all clients to ensure everyone is in sync
        io.emit("load-sticky-notes", notes);
      } catch (err) {
        console.error("Error loading sticky notes:", err);
        // Send cached data as fallback
        socket.emit("load-sticky-notes", stickyNotesCache);
      }
    });

    // Handle adding a new sticky note
    socket.on("add-note", async (note) => {
      try {
        // Generate a temporary ID if needed
        if (!note._id) {
          note._id = `temp_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;
        }

        // Update cache immediately for real-time updates
        stickyNotesCache.push(note);

        // Broadcast to all clients immediately
        // Use broadcast instead of io.emit to prevent feedback to the sender
        socket.broadcast.emit("note-added", note);

        // Debounce save to database
        debounceSave(`note_${note.id}`, addStickyNote, note);
      } catch (err) {
        console.error("Error adding sticky note:", err);
      }
    });

    // Handle deleting a sticky note
    socket.on("delete-sticky-note", async (note) => {
      try {
        // Update cache immediately
        stickyNotesCache = stickyNotesCache.filter((n) => n.id !== note.id);

        // Broadcast to all clients immediately
        // Use broadcast instead of io.emit to prevent feedback to the sender
        socket.broadcast.emit("sticky-note-deleted", note);

        // Debounce save to database
        debounceSave(`delete_note_${note.id}`, deleteStickyNote, note);
      } catch (err) {
        console.error("Error deleting sticky note:", err);
      }
    });

    // Handle updating a sticky note
    socket.on("updateNote", async (note) => {
      try {
        // Check if this is a position update (has position property)
        const isPositionUpdate = note.position !== undefined;
        // Check if this is a content update
        const isContentUpdate = note.isContentUpdate === true;
        // Check if this is a final content update that should be saved to the database
        const isFinalContent = note.isFinalContent === true;

        // For position updates, apply throttling to reduce network traffic
        if (isPositionUpdate && !throttleUpdate(`pos_${note.id}`)) {
          return; // Skip this update if it's too soon after the last one
        }

        // Update cache immediately
        const index = stickyNotesCache.findIndex((n) => n.id === note.id);
        if (index !== -1) {
          // Merge the update with the existing note
          stickyNotesCache[index] = { ...stickyNotesCache[index], ...note };
        }

        // Broadcast to all clients immediately
        // For content updates, we want to broadcast to all clients except the sender
        // to avoid cursor position issues
        if (isContentUpdate && !isFinalContent) {
          socket.broadcast.emit("updateNote", note);
        } else if (isPositionUpdate) {
          // For position updates, broadcast to all clients EXCEPT the sender
          // to avoid position jumping during drag operations
          socket.broadcast.emit("updateNote", note);
        } else {
          // For final content updates and other updates, broadcast to all clients
          io.emit("updateNote", note);
        }

        // Debounce save to database - only for final content updates or final position
        if (
          isFinalContent ||
          (!isPositionUpdate && !isContentUpdate) ||
          note.isFinalPosition
        ) {
          debounceSave(`update_note_${note.id}`, updateStickyNote, note);
        }
      } catch (err) {
        console.error("Error updating sticky note:", err);
      }
    });

    // Handle client requesting to load drawings
    socket.on("load-draw", async () => {
      try {
        // Send the main drawing to the requesting client
        socket.emit("load-drawing", mainDrawing);
      } catch (err) {
        console.error("Error loading drawings:", err);
      }
    });

    // Handle force clear drawing state event
    socket.on("force-clear-drawing-state", () => {
      const wasCleared = forceClearDrawingState(io, socket.id);
      if (wasCleared) {
        console.log(`Drawing state was force cleared by user ${socket.id}`);
      }
    });

    // Handle explicit ensure-drawing-stopped event (for touch device safety)
    socket.on("ensure-drawing-stopped", (data) => {
      if (currentlyDrawingUser === socket.id) {
        console.log(
          `Received ensure-drawing-stopped from ${socket.id}, clearing drawing state`
        );
        currentlyDrawingUser = null;

        // Update user's lastStatusChange timestamp
        if (connectedUsers.has(socket.id)) {
          const user = connectedUsers.get(socket.id);
          connectedUsers.set(socket.id, {
            ...user,
            lastStatusChange: Date.now(),
          });
        }

        // Broadcast updated user presence
        broadcastUserPresence(io);
      }
    });

    // Handle real-time drawing - NO DEBOUNCE for real-time sync
    socket.on("draw", (path) => {
      // If someone else is drawing, do not allow this user to draw
      if (currentlyDrawingUser && currentlyDrawingUser !== socket.id) {
        console.log(
          `User ${socket.id} attempted to draw but ${currentlyDrawingUser} is already drawing`
        );
        // Notify the client that drawing is not allowed
        socket.emit("drawing-not-allowed");
        return;
      }

      // Set this user as the currently drawing user if not already set
      if (!currentlyDrawingUser) {
        currentlyDrawingUser = socket.id;

        // Update user's lastStatusChange timestamp
        if (connectedUsers.has(socket.id)) {
          const user = connectedUsers.get(socket.id);
          connectedUsers.set(socket.id, {
            ...user,
            lastStatusChange: Date.now(),
          });
        }

        // Broadcast updated user presence to reflect who is drawing
        broadcastUserPresence(io);
      }

      // Update the last drawing activity time
      lastDrawingActivity = Date.now();

      // Add the path to the main drawing
      if (!mainDrawing.paths) {
        mainDrawing.paths = [];
      }
      mainDrawing.paths.push(path);

      // Broadcast to all other clients in real-time
      socket.broadcast.emit("draw", path);

      // Schedule a debounced save of the entire drawing
      debounceSave("main-drawing", saveDrawings, {
        ...mainDrawing,
        id: "main-drawing",
      });
    });

    // Handle saving drawing when user stops
    // socket.on("stop-draw", async (drawing) => {
    //   try {
    //     console.log(
    //       "stop-draw received with",
    //       drawing.paths ? drawing.paths.length : 0,
    //       "paths"
    //     );

    //     // Update the last drawing activity time on stop
    //     lastDrawingActivity = Date.now();

    //     // Clear the currently drawing user if this user was drawing
    //     if (currentlyDrawingUser === socket.id) {
    //       currentlyDrawingUser = null;

    //       // Update user's lastStatusChange timestamp
    //       if (connectedUsers.has(socket.id)) {
    //         const user = connectedUsers.get(socket.id);
    //         connectedUsers.set(socket.id, {
    //           ...user,
    //           lastStatusChange: Date.now(),
    //         });
    //       }

    //       // Broadcast updated user presence
    //       broadcastUserPresence(io);
    //     }

    //     // If the client sends a complete drawing, update our main drawing
    //     if (drawing && drawing.paths && Array.isArray(drawing.paths)) {
    //       // Ensure we're using the main-drawing ID
    //       drawing.id = "main-drawing";
    //       mainDrawing = drawing;

    //       // Broadcast the complete drawing to all clients to ensure consistency
    //       // This is crucial for undo/redo operations to sync properly
    //       io.emit("update-drawing", {
    //         ...mainDrawing,
    //         operation: "draw",
    //         source: "server",
    //       });

    //       // Debounce save to database
    //       debounceSave("main-drawing", saveDrawings, mainDrawing);
    //     }
    //   } catch (error) {
    //     console.error("❌ Error handling drawing:", error);

    //     // In case of an error, force clear the drawing state to prevent lock
    //     if (currentlyDrawingUser === socket.id) {
    //       currentlyDrawingUser = null;
    //       broadcastUserPresence(io);
    //     }
    //   }
    // });

    // Handle clearing the canvas
    socket.on("clear-canvas", async () => {
      try {
        console.log(
          "Received clear-canvas event, completely resetting drawing"
        );

        // Reset the main drawing to an empty state
        mainDrawing = { id: "main-drawing", paths: [] };

        // Broadcast to all clients immediately using update-drawing for consistency
        io.emit("update-drawing", {
          id: "main-drawing",
          paths: [],
          operation: "clear",
          source: "server",
        });

        // Also emit clear-canvas for backward compatibility
        io.emit("clear-canvas");

        // Immediately save the empty drawing to the database
        try {
          await saveDrawings({ id: "main-drawing", paths: [] });
          console.log("Empty drawing saved to database after clear-canvas");
        } catch (saveErr) {
          console.error("Error saving empty drawing:", saveErr);
        }
      } catch (err) {
        console.error("Error clearing canvas:", err);
      }
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);

      // If the disconnected user was drawing, clear the currently drawing user
      if (currentlyDrawingUser === socket.id) {
        console.log(
          `Drawing user ${socket.id} disconnected, clearing drawing state`
        );
        currentlyDrawingUser = null;
      }

      // Remove user from connected users
      connectedUsers.delete(socket.id);

      // Broadcast updated user presence
      broadcastUserPresence(io);
    });

    // Handle update-drawing event (for undo/redo operations)
    socket.on("update-drawing", async (drawing) => {
      try {
        const operation = drawing.operation || "update";
        const source = drawing.source || "unknown";

        console.log(
          `update-drawing received (${operation} from ${source}):`,
          drawing.paths ? `${drawing.paths.length} paths` : "no paths"
        );

        // Special handling for clear operations
        if (operation === "clear") {
          console.log("Processing clear operation in update-drawing");
          // Complete reset of drawing data
          mainDrawing = { id: "main-drawing", paths: [] };

          // Broadcast the cleared drawing to all clients
          io.emit("update-drawing", {
            id: "main-drawing",
            paths: [],
            operation: "clear",
            source: "server",
          });

          // Also emit clear-canvas for backward compatibility
          io.emit("clear-canvas");

          // Save immediately for clear operations
          try {
            await saveDrawings({ id: "main-drawing", paths: [] });
            console.log(
              "Empty drawing saved to database after clear operation"
            );
          } catch (saveErr) {
            console.error("Error saving empty drawing:", saveErr);
          }
          return;
        }

        // For normal update operations
        if (drawing && drawing.paths !== undefined) {
          // Ensure we're using the main-drawing ID
          drawing.id = "main-drawing";

          // Update the main drawing with the new paths
          mainDrawing = {
            ...mainDrawing,
            ...drawing,
            paths: Array.isArray(drawing.paths) ? drawing.paths : [],
          };

          console.log(`Broadcasting ${operation} operation to all clients`);

          // Broadcast the complete drawing to all clients
          io.emit("update-drawing", {
            id: "main-drawing",
            paths: mainDrawing.paths,
            operation,
            source: "server",
          });

          // Debounce save to database
          debounceSave("main-drawing", saveDrawings, mainDrawing);
        } else {
          console.warn("Received invalid update-drawing event:", drawing);
        }
      } catch (error) {
        console.error("❌ Error handling update-drawing:", error);
      }
    });
  });
};

/**
 * Generate a random color for user avatar
 * @returns {string} - Hex color code
 */
function getRandomColor() {
  const colors = [
    "#F44336",
    "#E91E63",
    "#9C27B0",
    "#673AB7",
    "#3F51B5",
    "#2196F3",
    "#03A9F4",
    "#00BCD4",
    "#009688",
    "#4CAF50",
    "#8BC34A",
    "#CDDC39",
    "#FFC107",
    "#FF9800",
    "#FF5722",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generate a random initial for user avatar
 * @returns {string} - Single letter initial
 */
function getRandomInitial() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return letters.charAt(Math.floor(Math.random() * letters.length));
}
