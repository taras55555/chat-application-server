require('dotenv').config()

const path = require('path')
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const express = require('express')
const passport = require('passport');
const session = require('express-session')
const authRouter = require('./routes/auth')
const MongoDBStore = require('connect-mongodb-session')(session)
const initUsers = require('./utils/initializeChats')
const app = express()
const port = process.env.PORT

const store = new MongoDBStore({
    uri: process.env.MONGODB_URI,
    databaseName: 'reenbit-test-project',
    collection: 'sessions'
});

store.on('error', function (error) {
    console.log(error);
});

const sessionMiddleware = session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    },
    store: store,
    resave: true,
    saveUninitialized: true
})

app.use(cors({
    origin: process.env.ORIGIN,
    credentials: true
}));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));
app.use('/', authRouter)

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });


server.on('upgrade', (req, socket, head) => {
    sessionMiddleware(req, {}, () => {
        if (!req.session.passport || !req.session.passport.user) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            ws.userId = req.session.passport.user.id.toString();
            wss.emit('connection', ws, req);
        });
    });
});

async function initMongodb() {
    await initUsers();
}

initMongodb()

const userSockets = new Map();
wss.on('connection', (ws, req) => {
    const userId = req.session.passport.user.id.toString();

    console.log(`✅ WebSocket connected for user ${userId}`);

    if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(ws);

    ws.on('message', async (targets) => {
        const { participantsWithoutMe, me = null, isPredefined = null, participantName = null, message = null } = JSON.parse(targets)

        console.log(`📩 Message from ${userId}: ${participantsWithoutMe} ${me}`);

        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.userId === participantsWithoutMe || client.userId === me) {
                const type = client.userId === me ? 'update' : 'notification'
                client.send(JSON.stringify({ type, participantName, message }));
            }
        });

        if (isPredefined) {
            const response = await fetch('http://api.quotable.io/quotes/random');
            const [{ content: message }] = await response.json();

            const responsePost = await fetch(`${process.env.SERVER_URL}/messages/bot`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 'sender': participantsWithoutMe, 'recipient': me, message })
            });
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN && client.userId === me) {

                    const type = 'notification'
                    client.send(JSON.stringify({ type, participantName, message }));
                }
            });

        }

    });

    ws.on('close', () => {
        const sockets = userSockets.get(userId);
        if (sockets) {
            sockets.delete(ws);
            if (sockets.size === 0) {
                userSockets.delete(userId);
            }
        }
        console.log(`❌ WebSocket disconnected for user ${userId}`);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/pages/index.html'))
});

server.listen(port, () => {
    console.log(`Server app listening on port http://localhost:${port}`)
})