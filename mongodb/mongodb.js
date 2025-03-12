
const { MongoClient } = require("mongodb");

const uri = "mongodb+srv://sreelakshmi:uWH7dGJq099JxG6H@syncboard.kh6rw.mongodb.net/?retryWrites=true&w=majority&appName=Syncboard"; // Update if needed // Update if needed
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

const connectDB = async () => {
    try {
        await client.connect();
        db = client.db("syncboard"); // Database name
        console.log("MongoDB Connected...");
    } catch (err) {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    }
};
module.exports = {
    read: async function (query, targetcollection, res) {
        try {
            await connectDB()
            const result = await db.collection(targetcollection).find().toArray();
            return result;
        } catch (err) {
            console.log(err)
            res.status(500).json({ error: err.message });
        }
    },
    write: async function (query, targetcollection, res) {
        try {
            await connectDB()
            console.log("query", query)
            const result = await db.collection(targetcollection).insertOne(query);
            return result;
        } catch (err) {
            console.log(err)
            throw err
        }
    },
    update: async function (query, targetcollection, res) {
        try {
            await connectDB()
            const result = await db.collection(targetcollection).updateOne(
                { id: (query.id) },
                { $set: { text: query.text, color: query.color } }
            );
            return result;
        } catch (err) {
            console.log(err)
            throw err
        }
    },
    delete: async function (query, targetcollection, res) {
        try {
            await connectDB()
            const result = db.collection(targetcollection).deleteOne({ id: query });
            return result;
        } catch (err) {
            console.log(err)
            throw err
        }
    },
}