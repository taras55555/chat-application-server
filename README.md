# Chat Application Server

This is a Node.js backend server for a chat application. It handles user authentication, WebSocket connections, and message routing.

## Features

- Google OAuth 2.0 authentication
- WebSocket support for real-time messaging
- User session management
- REST API endpoints for messaging

## Technologies

- Node.js
- Express
- WebSocket (`ws`)
- Passport.js (Google OAuth)
- MongoDB / MySQL (your DB here)
- dotenv

## Environment Variables
PORT =''

# MONGODB CREDENTIALS
MONGODB_URI =''

# GOOGLE
GOOGLE_CLIENT_ID=''
GOOGLE_CLIENT_SECRET=''

# SESSION SECRET
EXPRESS_SESSION_SECRET=''

# CORS ORIGINS
ORIGIN=''