const express = require('express')
const router = express.Router()
const passport = require('passport');
const GoogleStrategy = require('passport-google-oidc');
const { MongoClient, ObjectId } = require("mongodb");
const mongoClient = new MongoClient(process.env.MONGODB_URI);
const db = mongoClient.db('reenbit-test-project');


async function fetchUserById(userId) {

    const query = { _id: new ObjectId(userId) }
    const user = await db.collection('users').findOne(query);

    return user
}

passport.use(new GoogleStrategy({
    clientID: process.env['GOOGLE_CLIENT_ID'],
    clientSecret: process.env['GOOGLE_CLIENT_SECRET'],
    callbackURL: '/oauth2/redirect/google',
    scope: ['profile', 'email']
}, async function verify(issuer, profile, cb) {
    try {
        const federated = await db.collection('federated_credentials').findOne({
            provider: issuer,
            subject: profile.id
        });

        if (!federated) {
            const userInsertResult = await db.collection('users').insertOne({
                name: profile.displayName,
                email: profile.emails[0]['value']
            });

            const userId = userInsertResult.insertedId;

            const predefinedUsers = await db.collection('users').find({ isPredefined: true }).toArray();
            const predefinedConversations = predefinedUsers.map((user) => {
                const conversation = {}
                conversation.members = [userId.toString(), user._id.toString()]
                conversation.memberNames = { [userId]: profile.displayName, [user._id]: user.name }
                conversation.chatHistory = []
                conversation.isPredefined = true

                return conversation
            })

            await db.collection('conversations').insertMany(predefinedConversations);

            await db.collection('federated_credentials').insertOne({
                user_id: userId,
                provider: issuer,
                subject: profile.id
            });

            const user = {
                id: userId,
                name: profile.displayName
            };

            return cb(null, user);
        } else {
            const user = await db.collection('users').findOne({
                _id: federated.user_id
            });

            if (!user) return cb(null, false);

            return cb(null, {
                id: user._id,
                name: user.name
            });
        }
    } catch (err) {
        return cb(err);
    }
}));

passport.serializeUser(function (user, cb) {
    process.nextTick(function () {
        cb(null, { id: user.id, username: user.username, name: user.name });
    });
});

passport.deserializeUser(function (user, cb) {
    process.nextTick(function () {
        return cb(null, user);
    });
});

router.get('/login/federated/google', passport.authenticate('google'));

router.get('/oauth2/redirect/google', passport.authenticate('google', {
    successRedirect: process.env.ORIGIN,
    failureRedirect: '/login'
}));

router.get('/login', function (req, res, next) {
    res.send('error');
});

router.get('/user', (req, res) => {
    try {
        if (req.isAuthenticated()) {
            res.status(200).json(req.user)
        } else {
            res.status(200).json({ "isAuthenticated": req.isAuthenticated() })
        }

    } catch (err) {
        res.status(500).json({ error: 'Error fetching user' });
    }

})

router.get('/user/:id', async (req, res) => {

    const { id } = req.params
    const query = { _id: new ObjectId(id) }
    const user = await db.collection('users').findOne(query);

    res.json({ user })

})

router.get('/users', async (req, res) => {
    const user = await db.collection('users').find().toArray();

    res.json(user)
})

router.get('/users/:search', async (req, res) => {

    const currentUserIdObject = req.user.id
    const { search } = req.params
    const query = {
        $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
        ]
    }
    const user = (await db.collection('users')
        .find(query)
        .toArray())
        .filter(user => !user._id.equals(currentUserIdObject))

    res.json(user)
})

router.get('/messages', async (req, res) => {
    const currentUserId = req.user.id.toString()
    const query = { members: currentUserId }
    const messages = await db.collection('conversations')
        .find(query)
        .sort({ lastActivity: -1 })
        .toArray()
    const contactsList = messages.map((contact) => {
        const lastMessage = contact.chatHistory?.slice(-1)
        if (lastMessage.length) {
            contact.chatHistory.length = 0
            contact.chatHistory = lastMessage
            const truncatedMessage = (maxLength) => lastMessage[0].message.length > maxLength
                ? `${lastMessage[0].message.slice(0, maxLength)}...`
                : lastMessage[0].message
            lastMessage[0].message = truncatedMessage(15)
            contact.members = contact.members.filter(member => member !== currentUserId)
        }
        return contact
    })
    res.json(contactsList)
})

router.get('/message/:search', async (req, res) => {
    const currentUserId = req.user.id.toString()
    const { search: participantId } = req.params

    const query = { $and: [{ members: currentUserId }, { members: participantId }] }
    const { chatHistory = [], memberNames = {}, isPredefined } = await db.collection('conversations').findOne(query) || []

    res.json({ chatHistory, memberNames, isPredefined })
})

router.post('/messages', async (req, res) => {
    const { participantsWithoutMe, message } = req.body
    const currentUserId = req.user.id.toString()
    const currentUserName = req.user.name

    const { name: participantName } = await fetchUserById(participantsWithoutMe)

    const newMessage = {
        sender: currentUserId,
        currentUserName,
        message,
        timeSent: new Date(),
    }

    const query = { $and: [{ members: currentUserId }, { members: participantsWithoutMe }] }
    const foundConversation = await db.collection('conversations').findOne(query)

    if (foundConversation) {

        const updateConversationResult = await db.collection('conversations').updateOne(
            { _id: foundConversation._id },
            {
                $push: { chatHistory: newMessage },
                $set: {
                    lastActivity: new Date(),
                    [`memberNames.${currentUserId}`]: currentUserName
                },
            }
        )

    } else {
        const conversationInsertResult = await db.collection('conversations').insertOne({
            members: [currentUserId, participantsWithoutMe],
            memberNames: { [currentUserId]: currentUserName, [participantsWithoutMe]: participantName },
            chatHistory: [newMessage],
            lastActivity: new Date()

        });
    }

    res.json({ foundConversation })
})

router.post('/messages/bot', async (req, res) => {
    const { sender, recipient, message } = req.body
    const newMessage = {
        sender: sender,
        message,
        timeSent: new Date(),
    }

    const query = { $and: [{ members: sender }, { members: recipient }] }
    const foundConversation = await db.collection('conversations').findOne(query)

    if (foundConversation) {

        const updateConversationResult = await db.collection('conversations').updateOne(
            { _id: foundConversation._id },
            {
                $push: { chatHistory: newMessage },
                $set: { lastActivity: new Date() },
            }
        )

        return res.json({ updateConversationResult })
    }

    res.json({ 'message': 'No conversation found for the given criteria.' })

})

router.post('/logout', function (req, res, next) {
    req.logout(function (err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

module.exports = router