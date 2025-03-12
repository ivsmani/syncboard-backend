const { getStickyNotes, addStickyNote, deleteStickyNote, updateStickyNote } = require("../controller/stickyNoteController");
const { saveDrawings, deletedrawings } = require("../controller/drawingController");
let currentDrawing = [];
module.exports = (io) => {
    io.on("connection", (socket) => {
        console.log("User connected:", socket.id);

        // Load all sticky notes
        socket.on("load-sticky-notes", async () => {
            try {

                const notes = await getStickyNotes();

                io.emit("load-sticky-notes", notes);
            } catch (err) {
                console.error("Error loading sticky notes:", err);
            }
        });
        socket.on("add-note", async (note) => {
            io.emit("note-added", note);
            const result = await addStickyNote(note);
            console.log(result)
            note._id = result.insertedId;

        });
        socket.on("delete-sticky-note", async (note) => {
            try {
                io.emit("sticky-note-deleted", note);
                await deleteStickyNote(note)

            } catch (err) {
                console.error("Error deleting sticky note:", err);
            }
        });
        // // Update sticky note
        socket.on("updateNote", async (note) => {
            io.emit("updateNote", note);
            const result = await updateStickyNote(note);//for saving 
            console.log(result)

        });
        socket.on("draw", (path) => {
            currentDrawing.push(path);
            socket.broadcast.emit("draw", path);
        });

        // Save drawing when user stops
        socket.on("stop-draw", async () => {
            try {
                if (currentDrawing.length > 0) {
                    await saveDrawings(currentDrawing);
                    socket.emit("drawing-saved");
                }
            } catch (error) {
                console.error("❌ Error Saving Drawing:", error);
            }
        });

        // Clear canvas
        socket.on("clear-canvas", async (drawing) => {
            currentDrawing = [];
            io.emit("clear-canvas");
            await deletedrawings(drawing)

        });

        socket.on("disconnect", () => {
            console.log("User disconnected");
        });
    });

}