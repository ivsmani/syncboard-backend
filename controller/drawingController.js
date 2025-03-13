const mongodbController = require("../mongodb/mongodb");
const dataCollection = "drawings";

/**
 * Save drawing data to the database
 * @param {Object} drawing - Drawing data to save
 * @returns {Promise<Object>} - Result of the save operation
 */
exports.saveDrawings = async (drawing) => {
  try {
    // Validate drawing data
    if (!drawing) {
      console.warn("Attempted to save undefined drawing");
      return null;
    }

    // Ensure drawing has an ID
    if (!drawing.id) {
      drawing.id = `drawing_${Date.now()}`; // Generate a timestamp-based ID
      console.log(`Generated new drawing ID: ${drawing.id}`);
    }

    // Add timestamp for tracking
    drawing.lastUpdated = new Date().toISOString();

    // Check if drawing already exists
    const existingDrawings = await mongodbController.read(
      { id: drawing.id },
      dataCollection
    );

    let result;
    if (existingDrawings && existingDrawings.length > 0) {
      // Update existing drawing
      console.log(`Updating existing drawing: ${drawing.id}`);
      result = await mongodbController.update(drawing, dataCollection);
    } else {
      // Create new drawing
      console.log(`Creating new drawing: ${drawing.id}`);
      result = await mongodbController.write(drawing, dataCollection);
    }

    return result;
  } catch (err) {
    console.error("Error saving drawing:", err);
    // Don't throw, just return null to prevent app crashes
    return null;
  }
};

/**
 * Get all drawings from the database
 * @returns {Promise<Array>} - Array of drawings
 */
exports.getDrawings = async () => {
  try {
    const drawResult = await mongodbController.read({}, dataCollection);
    return drawResult || [];
  } catch (err) {
    console.error("Error getting drawings:", err);
    return []; // Return empty array instead of throwing to prevent app crashes
  }
};

/**
 * Delete a drawing from the database
 * @param {Object} drawing - Drawing to delete
 * @returns {Promise<Object>} - Result of the delete operation
 */
exports.deletedrawings = async (drawing) => {
  try {
    if (!drawing || !drawing.id) {
      console.warn("Invalid drawing data: missing ID");
      return null;
    }

    console.log(`Deleting drawing: ${drawing.id}`);
    const deleteResult = await mongodbController.delete(
      drawing.id,
      dataCollection
    );
    return deleteResult;
  } catch (err) {
    console.error("Error deleting drawing:", err);
    // Don't throw, just return null to prevent app crashes
    return null;
  }
};
