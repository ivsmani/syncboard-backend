// const { db } = require("../config/db");
// const { ObjectId } = require("mongodb");
const mongodbController = require("../mongodb/mongodb");
const dataCollection = "stickyNotes";

/**
 * Get all sticky notes from the database
 * @returns {Promise<Array>} - Array of sticky notes
 */
exports.getStickyNotes = async () => {
  try {
    const notesData = await mongodbController.read({}, dataCollection);
    return notesData || [];
  } catch (err) {
    console.error("Error getting sticky notes:", err);
    return []; // Return empty array instead of throwing to prevent app crashes
  }
};

/**
 * Add a sticky note to the database
 * @param {Object} note - Sticky note to add
 * @returns {Promise<Object>} - Result of the add operation
 */
exports.addStickyNote = async (note) => {
  try {
    // Validate note data
    if (!note) {
      console.warn("Attempted to save undefined sticky note");
      return null;
    }

    // Ensure note has an ID
    if (!note.id) {
      note.id = `note_${Date.now()}`; // Generate a timestamp-based ID
      console.log(`Generated new sticky note ID: ${note.id}`);
    }

    // Add timestamp for tracking
    note.lastUpdated = new Date().toISOString();

    console.log(`Adding sticky note: ${note.id}`);
    const notesResult = await mongodbController.write(note, dataCollection);
    return notesResult;
  } catch (err) {
    console.error("Error adding sticky note:", err);
    return null; // Return null instead of throwing to prevent app crashes
  }
};

/**
 * Update a sticky note in the database
 * @param {Object} note - Sticky note to update
 * @returns {Promise<Object>} - Result of the update operation
 */
exports.updateStickyNote = async (note) => {
  try {
    // Validate note data
    if (!note || !note.id) {
      console.warn("Invalid sticky note data for update");
      return null;
    }

    // Add timestamp for tracking
    note.lastUpdated = new Date().toISOString();

    console.log(`Updating sticky note: ${note.id}`);
    const notesResult = await mongodbController.update(note, dataCollection);
    return notesResult;
  } catch (err) {
    console.error("Error updating sticky note:", err);
    return null; // Return null instead of throwing to prevent app crashes
  }
};

/**
 * Delete a sticky note from the database
 * @param {Object} note - Sticky note to delete
 * @returns {Promise<Object>} - Result of the delete operation
 */
exports.deleteStickyNote = async (note) => {
  try {
    // Validate note data
    if (!note || !note.id) {
      console.warn("Invalid sticky note data for deletion");
      return null;
    }

    console.log(`Deleting sticky note: ${note.id}`);
    const deleteResult = await mongodbController.delete(
      note.id,
      dataCollection
    );
    return deleteResult;
  } catch (err) {
    console.error("Error deleting sticky note:", err);
    return null; // Return null instead of throwing to prevent app crashes
  }
};
