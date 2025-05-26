require('dotenv').config()
const express = require('express')
const session = require('express-session')

const cors = require('cors');
const app = express()
const path = require('path')
const port = process.env.PORT
const authRouter = require('./routes/auth')
const passport = require('passport');
const MongoDBStore = require('connect-mongodb-session')(session)
const store = new MongoDBStore({
    uri: process.env.MONGODB_URI,
    databaseName: 'reenbit-test-project',
    collection: 'sessions'
});

store.on('error', function (error) {
    console.log(error);
});

app.use(cors({
    origin: process.env.ORIGIN,
    credentials: true
}));
app.use(express.json());
app.use(require('express-session')({
    secret: process.env.EXPRESS_SESSION_SECRET,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7
    },
    store: store,
    resave: true,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));
app.use('/', authRouter)


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/pages/index.html'))
});

app.listen(port, () => {
    console.log(`Server app listening on port http://localhost:${port}`)
})