const mongodbController = require("../mongodb/mongodb")
const dataCollection = "drawings";
exports.saveDrawings = async (req, res) => {
    try {

        const data = req;
        data.id = "CAN001"
        const notesResult = await mongodbController.write(data, dataCollection);
        return notesResult;
    } catch (err) {
        throw err
    }
};
exports.getDrawings = async (req, res) => {
    try {
        const drawResult = await mongodbController.read({}, dataCollection)
        return (drawResult);
    } catch (err) {

        throw err
    }
};
exports.getDrawings = async (req, res) => {
    try {
        const drawResult = await mongodbController.read({}, dataCollection)
        return (drawResult);
    } catch (err) {

        throw err
    }
};
exports.deletedrawings = async (req, res) => {
    try {
        const id = req;
        let deleteResult = await mongodbController.delete(id, dataCollection)
        return deleteResult
    } catch (err) {
        throw err
    }
};