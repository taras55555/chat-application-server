const { MongoClient } = require("mongodb");

const predefinedUsers = [
    { name: 'Support Bot', isPredefined: true },
    { name: 'Welcome Chat', isPredefined: true },
    { name: 'FAQ', isPredefined: true },
];

async function initUsers() {
    const mongoClient = new MongoClient(process.env.MONGODB_URI)
    const db = mongoClient.db('reenbit-test-project')
    const users = db.collection('users')

    const names = predefinedUsers.map(u => u.name)
    const existingUsers = await users.find({ name: { $in: names } }).toArray()
    const existingNames = existingUsers.map(u => u.name)
    const usersToAdd = predefinedUsers.filter(u => !existingNames.includes(u.name))
    if (usersToAdd.length > 0) {
        await users.insertMany(usersToAdd);
    }
}

module.exports = initUsers