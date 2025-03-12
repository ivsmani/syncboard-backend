// const { db } = require("../config/db");
// const { ObjectId } = require("mongodb");
const mongodbController = require("../mongodb/mongodb")
const dataCollection = "stickyNotes";
exports.getStickyNotes = async (req, res) => {
    try {
        const notesData = await mongodbController.read({}, dataCollection)
        console.log(notesData)
        return (notesData);
    } catch (err) {

        throw err
    }
};

// Add a sticky note
exports.addStickyNote = async (req, res) => {
    try {
        console.log(req)
        const data = req;
        const notesResult = await mongodbController.write(data, dataCollection);
        return notesResult;
    } catch (err) {
        throw err
    }
};
//update  sticky note
exports.updateStickyNote = async (req, res) => {
    try {
        const data = req;
        const notesResult = await mongodbController.update(data, dataCollection);
        return notesResult
    } catch (err) {
        throw err
    }
};
// Delete a sticky note
exports.deleteStickyNote = async (req, res) => {
    try {
        const id = req;
        let deleteResult = await mongodbController.delete(id, dataCollection)
        return deleteResult
    } catch (err) {
        throw err
    }
};
