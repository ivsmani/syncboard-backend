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

// Debounce timers for saving to MongoDB
const saveTimers = new Map();
const DEBOUNCE_DELAY = 2000; // 2 seconds debounce delay

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
        mainDrawing = existingMainDrawing;
        console.log("Loaded main drawing from database");
      } else {
        console.log("No main drawing found, using empty drawing");
      }
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
  }
};

module.exports = (io) => {
  // Initialize data when the server starts
  initializeData();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Immediately send existing drawings and sticky notes to the new client
    socket.emit("load-drawing", mainDrawing);
    socket.emit("load-sticky-notes", stickyNotesCache);

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
        io.emit("note-added", note);

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
        io.emit("sticky-note-deleted", note);

        // Debounce save to database
        debounceSave(`delete_note_${note.id}`, deleteStickyNote, note);
      } catch (err) {
        console.error("Error deleting sticky note:", err);
      }
    });

    // Handle updating a sticky note
    socket.on("updateNote", async (note) => {
      try {
        // Update cache immediately
        const index = stickyNotesCache.findIndex((n) => n.id === note.id);
        if (index !== -1) {
          stickyNotesCache[index] = note;
        }

        // Broadcast to all clients immediately
        io.emit("updateNote", note);

        // Debounce save to database
        debounceSave(`update_note_${note.id}`, updateStickyNote, note);
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

    // Handle real-time drawing - NO DEBOUNCE for real-time sync
    socket.on("draw", (path) => {
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
    socket.on("stop-draw", async (drawing) => {
      try {
        console.log("stop-draw received");

        // If the client sends a complete drawing, update our main drawing
        if (drawing && drawing.paths && Array.isArray(drawing.paths)) {
          // Ensure we're using the main-drawing ID
          drawing.id = "main-drawing";
          mainDrawing = drawing;
        }

        // Broadcast the complete drawing to all clients to ensure consistency
        io.emit("update-drawing", mainDrawing);

        // Debounce save to database
        debounceSave("main-drawing", saveDrawings, mainDrawing);
      } catch (error) {
        console.error("❌ Error handling drawing:", error);
      }
    });

    // Handle clearing the canvas
    socket.on("clear-canvas", async () => {
      try {
        // Clear the main drawing
        mainDrawing = { id: "main-drawing", paths: [] };

        // Broadcast to all clients immediately
        io.emit("clear-canvas");

        // Debounce save to database - save an empty drawing
        debounceSave("clear-main-drawing", saveDrawings, mainDrawing);
      } catch (err) {
        console.error("Error clearing canvas:", err);
      }
    });

    // Handle client disconnection
    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};
